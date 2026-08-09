#include "WebSocketServer.h"

#include <chrono>
#include <iostream>

namespace asio = boost::asio;
namespace beast = boost::beast;
namespace websocket = boost::beast::websocket;
using tcp = boost::asio::ip::tcp;
using protocol::Json;

namespace {

std::string dumpJson(const Json& message) {
  return message.dump(-1, ' ', false, nlohmann::json::error_handler_t::replace);
}

std::string requestIdOf(const Json& command) {
  if (command.contains("requestId") && command.at("requestId").is_string()) {
    return command.at("requestId").get<std::string>();
  }
  return {};
}

} // namespace

WebSocketServer::WebSocketServer(asio::io_context& io, unsigned short port)
  : io_(io),
    acceptor_(io),
    serial_(std::make_shared<SerialSession>(io)),
    port_(port) {
  serial_->setEventHandler([this](Json message) {
    broadcast(message);
  });
}

bool WebSocketServer::listen() {
  boost::system::error_code ec;
  acceptor_.open(tcp::v4(), ec);
  if (ec) return false;

  acceptor_.set_option(asio::socket_base::reuse_address(true), ec);
  if (ec) return false;

  acceptor_.bind(tcp::endpoint(asio::ip::make_address("127.0.0.1"), port_), ec);
  if (ec) return false;

  acceptor_.listen(asio::socket_base::max_listen_connections, ec);
  if (ec) return false;

  acceptNext();
  return true;
}

void WebSocketServer::acceptNext() {
  auto self = shared_from_this();
  acceptor_.async_accept(asio::make_strand(io_), [this, self](boost::system::error_code ec, tcp::socket socket) {
    if (!ec) {
      auto session = std::make_shared<WebSocketSession>(std::move(socket), self, port_);
      clients_.insert(session);
      session->start();
    }
    acceptNext();
  });
}

void WebSocketServer::broadcast(const Json& message) {
  const std::string text = dumpJson(message);
  const std::string type = message.value("type", std::string());
  const auto delivery = type == "serial:rx" || type == "serial:tx"
    ? WebSocketSession::DeliveryClass::Realtime
    : WebSocketSession::DeliveryClass::Control;
  for (const auto& client : clients_) {
    client->send(text, delivery);
  }
}

void WebSocketServer::routeCommand(const std::shared_ptr<WebSocketSession>& client, const std::string& message) {
  Json command;
  try {
    command = Json::parse(message);
  } catch (...) {
    sendTo(client, protocol::makeError("", "WebSocket 消息必须是 JSON 对象"));
    return;
  }

  if (!command.is_object()) {
    sendTo(client, protocol::makeError("", "WebSocket 消息必须是 JSON 对象"));
    return;
  }

  const std::string requestId = requestIdOf(command);
  if (!command.contains("type") || !command.at("type").is_string()) {
    sendTo(client, protocol::makeError(requestId, "命令 type 必须是字符串"));
    return;
  }

  const std::string type = command.at("type").get<std::string>();
  Json payload = Json::object();
  if (command.contains("payload")) {
    payload = command.at("payload");
    if (!payload.is_object()) {
      sendTo(client, protocol::makeError(requestId, "命令 payload 必须是 JSON 对象"));
      return;
    }
  }

  try {
    if (type == "ports:list") {
      sendTo(client, protocol::makeOk(requestId, "ports:list", listSerialPorts()));
      return;
    }

    if (type == "serial:open") {
      sendTo(client, protocol::makeOk(requestId, "serial:open:result", serial_->open(payload)));
      return;
    }

    if (type == "serial:close") {
      sendTo(client, protocol::makeOk(requestId, "serial:close:result", serial_->close()));
      return;
    }

    if (type == "serial:send") {
      sendTo(client, protocol::makeOk(requestId, "serial:send:result", serial_->sendPayload(payload)));
      return;
    }

    if (type == "backend:shutdown") {
      sendTo(client, protocol::makeOk(requestId, "backend:shutdown:result", {{"ok", true}}));
      auto timer = std::make_shared<asio::steady_timer>(io_, std::chrono::milliseconds(150));
      timer->async_wait([this, timer](boost::system::error_code) {
        boost::system::error_code ignored;
        acceptor_.close(ignored);
        io_.stop();
      });
      return;
    }

    sendTo(client, protocol::makeError(requestId, "未知命令：" + type));
  } catch (const std::exception& error) {
    sendTo(client, protocol::makeError(requestId, std::string("命令处理失败：") + error.what()));
  }
}

void WebSocketServer::remove(const std::shared_ptr<WebSocketSession>& client) {
  clients_.erase(client);
}

void WebSocketServer::sendTo(const std::shared_ptr<WebSocketSession>& client, const Json& message) {
  if (client) {
    client->send(dumpJson(message));
  }
}

WebSocketSession::WebSocketSession(TcpSocket socket, std::weak_ptr<WebSocketServer> server, unsigned short port)
  : ws_(std::move(socket)),
    server_(std::move(server)),
    port_(port) {
}

void WebSocketSession::start() {
  auto self = shared_from_this();
  ws_.set_option(websocket::stream_base::timeout::suggested(beast::role_type::server));
  ws_.read_message_max(kMaxIncomingMessageBytes);
  ws_.set_option(websocket::stream_base::decorator([](websocket::response_type& response) {
    response.set(beast::http::field::server, "SerialScope Native Backend");
  }));

  ws_.async_accept([this, self](boost::system::error_code ec) {
    if (ec) {
      if (auto server = server_.lock()) {
        server->remove(self);
      }
      return;
    }

    send(dumpJson({
      {"type", "backend:hello"},
      {"payload", {
        {"name", "SerialScope Native Backend"},
        {"version", "0.2.0"},
        {"wsPort", port_}
      }}
    }));

    if (auto server = server_.lock()) {
      server->routeCommand(self, R"({"type":"ports:list","payload":{}})");
    }
    readNext();
  });
}

void WebSocketSession::send(const std::string& message, DeliveryClass delivery) {
  auto self = shared_from_this();
  asio::post(ws_.get_executor(), [this, self, message, delivery] {
    if (closingForOverload_) {
      return;
    }

    const std::size_t messageBytes = message.size();
    if (delivery == DeliveryClass::Realtime) {
      if (messageBytes <= kMaxRealtimeBytes
          && realtimeOutgoing_.size() < kMaxRealtimeMessages
          && realtimeOutgoingBytes_ + messageBytes <= kMaxRealtimeBytes) {
        realtimeOutgoing_.push_back(message);
        realtimeOutgoingBytes_ += messageBytes;
        writeNext();
        return;
      }
      droppedMessages_ += 1;
      droppedBytes_ += messageBytes;
      return;
    }

    if (messageBytes > kMaxControlBytes
        || controlOutgoing_.size() >= kMaxControlMessages
        || controlOutgoingBytes_ + messageBytes > kMaxControlBytes) {
      closeForOverload();
      return;
    }

    controlOutgoing_.push_back(message);
    controlOutgoingBytes_ += messageBytes;
    writeNext();
  });
}

void WebSocketSession::readNext() {
  auto self = shared_from_this();
  ws_.async_read(buffer_, [this, self](boost::system::error_code ec, std::size_t) {
    if (ec) {
      if (auto server = server_.lock()) {
        server->remove(self);
      }
      return;
    }

    const std::string message = beast::buffers_to_string(buffer_.data());
    buffer_.consume(buffer_.size());
    if (auto server = server_.lock()) {
      server->routeCommand(self, message);
    }
    readNext();
  });
}

void WebSocketSession::writeNext() {
  if (writeInProgress_) {
    return;
  }

  enqueueBackpressureNotice();
  std::deque<std::string>* queue = nullptr;
  if (!controlOutgoing_.empty()) {
    writingClass_ = DeliveryClass::Control;
    queue = &controlOutgoing_;
  } else if (!realtimeOutgoing_.empty()) {
    writingClass_ = DeliveryClass::Realtime;
    queue = &realtimeOutgoing_;
  }
  if (queue == nullptr) {
    return;
  }

  writeInProgress_ = true;
  auto self = shared_from_this();
  ws_.text(true);
  ws_.async_write(asio::buffer(queue->front()), [this, self](boost::system::error_code ec, std::size_t) {
    if (ec) {
      if (auto server = server_.lock()) {
        server->remove(self);
      }
      return;
    }

    auto& writtenQueue = writingClass_ == DeliveryClass::Control ? controlOutgoing_ : realtimeOutgoing_;
    auto& writtenBytes = writingClass_ == DeliveryClass::Control ? controlOutgoingBytes_ : realtimeOutgoingBytes_;
    writtenBytes -= writtenQueue.front().size();
    writtenQueue.pop_front();
    writeInProgress_ = false;
    writeNext();
  });
}

void WebSocketSession::enqueueBackpressureNotice() {
  if (droppedMessages_ == 0 || controlOutgoing_.size() >= kMaxControlMessages) {
    return;
  }

  const std::string notice = dumpJson({
    {"type", "backend:backpressure"},
    {"payload", {
      {"droppedMessages", droppedMessages_},
      {"droppedBytes", droppedBytes_},
      {"message", "客户端处理过慢，部分实时事件已丢弃"}
    }}
  });
  if (controlOutgoingBytes_ + notice.size() > kMaxControlBytes) {
    return;
  }

  controlOutgoing_.push_back(notice);
  controlOutgoingBytes_ += notice.size();
  droppedMessages_ = 0;
  droppedBytes_ = 0;
}

void WebSocketSession::closeForOverload() {
  if (closingForOverload_) {
    return;
  }
  closingForOverload_ = true;
  boost::system::error_code ignored;
  ws_.next_layer().close(ignored);
  if (auto server = server_.lock()) {
    server->remove(shared_from_this());
  }
}
