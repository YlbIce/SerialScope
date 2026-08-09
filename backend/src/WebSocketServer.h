#pragma once

#include "SerialSession.h"

#include <cstddef>
#include <deque>
#include <memory>
#include <set>
#include <string>

#include <boost/asio.hpp>
#include <boost/beast.hpp>

class WebSocketSession;

class WebSocketServer final : public std::enable_shared_from_this<WebSocketServer> {
public:
  WebSocketServer(boost::asio::io_context& io, unsigned short port);

  bool listen();
  void broadcast(const protocol::Json& message);
  void routeCommand(const std::shared_ptr<WebSocketSession>& client, const std::string& message);
  void remove(const std::shared_ptr<WebSocketSession>& client);

private:
  void acceptNext();
  void sendTo(const std::shared_ptr<WebSocketSession>& client, const protocol::Json& message);

  boost::asio::io_context& io_;
  boost::asio::ip::tcp::acceptor acceptor_;
  std::shared_ptr<SerialSession> serial_;
  std::set<std::shared_ptr<WebSocketSession>> clients_;
  unsigned short port_;
};

class WebSocketSession final : public std::enable_shared_from_this<WebSocketSession> {
public:
  using TcpSocket = boost::asio::ip::tcp::socket;
  using WebSocket = boost::beast::websocket::stream<TcpSocket>;
  enum class DeliveryClass { Control, Realtime };

  WebSocketSession(TcpSocket socket, std::weak_ptr<WebSocketServer> server, unsigned short port);

  void start();
  void send(const std::string& message, DeliveryClass delivery = DeliveryClass::Control);

private:
  static constexpr std::size_t kMaxIncomingMessageBytes = 1024 * 1024;
  static constexpr std::size_t kMaxControlMessages = 64;
  static constexpr std::size_t kMaxControlBytes = 1024 * 1024;
  static constexpr std::size_t kMaxRealtimeMessages = 256;
  static constexpr std::size_t kMaxRealtimeBytes = 4 * 1024 * 1024;

  void readNext();
  void writeNext();
  void enqueueBackpressureNotice();
  void closeForOverload();

  WebSocket ws_;
  boost::beast::flat_buffer buffer_;
  std::weak_ptr<WebSocketServer> server_;
  unsigned short port_;
  std::deque<std::string> controlOutgoing_;
  std::deque<std::string> realtimeOutgoing_;
  DeliveryClass writingClass_ = DeliveryClass::Control;
  bool writeInProgress_ = false;
  bool closingForOverload_ = false;
  std::size_t controlOutgoingBytes_ = 0;
  std::size_t realtimeOutgoingBytes_ = 0;
  std::size_t droppedMessages_ = 0;
  std::size_t droppedBytes_ = 0;
};
