#include "NamedPipeServer.h"

#include <Sddl.h>
#include <Aclapi.h>

#include <array>
#include <chrono>
#include <cstdlib>
#include <future>
#include <iostream>
#include <limits>
#include <thread>
#include <utility>
#include <vector>

namespace asio = boost::asio;
using protocol::Json;

namespace {

std::string dumpJson(const Json& value) {
  return value.dump(-1, ' ', false, nlohmann::json::error_handler_t::replace);
}

std::string notificationMethod(std::string type) {
  for (char& ch : type) {
    if (ch == ':') ch = '.';
  }
  return type;
}

std::uint32_t decodeLength(const std::array<std::uint8_t, 4>& bytes) {
  return static_cast<std::uint32_t>(bytes[0])
    | (static_cast<std::uint32_t>(bytes[1]) << 8)
    | (static_cast<std::uint32_t>(bytes[2]) << 16)
    | (static_cast<std::uint32_t>(bytes[3]) << 24);
}

std::array<std::uint8_t, 4> encodeLength(std::size_t size) {
  return {
    static_cast<std::uint8_t>(size & 0xFF),
    static_cast<std::uint8_t>((size >> 8) & 0xFF),
    static_cast<std::uint8_t>((size >> 16) & 0xFF),
    static_cast<std::uint8_t>((size >> 24) & 0xFF)
  };
}

bool transferOverlapped(HANDLE pipe, void* buffer, DWORD size, bool write, DWORD timeoutMs, DWORD& transferred) {
  transferred = 0;
  HANDLE event = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  if (event == nullptr) return false;
  OVERLAPPED operation {};
  operation.hEvent = event;

  const BOOL started = write
    ? WriteFile(pipe, buffer, size, &transferred, &operation)
    : ReadFile(pipe, buffer, size, &transferred, &operation);
  if (!started) {
    const DWORD error = GetLastError();
    if (error != ERROR_IO_PENDING) {
      CloseHandle(event);
      return false;
    }
    const DWORD wait = WaitForSingleObject(event, timeoutMs);
    if (wait != WAIT_OBJECT_0) {
      CancelIoEx(pipe, &operation);
      WaitForSingleObject(event, INFINITE);
      CloseHandle(event);
      return false;
    }
    if (!GetOverlappedResult(pipe, &operation, &transferred, FALSE)) {
      CloseHandle(event);
      return false;
    }
  }
  CloseHandle(event);
  return true;
}

std::wstring currentUserSid() {
  HANDLE token = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return {};
  DWORD size = 0;
  GetTokenInformation(token, TokenUser, nullptr, 0, &size);
  std::vector<std::uint8_t> data(size);
  const bool read = size != 0 && GetTokenInformation(token, TokenUser, data.data(), size, &size);
  CloseHandle(token);
  if (!read) return {};
  const auto* user = reinterpret_cast<const TOKEN_USER*>(data.data());
  LPWSTR sidString = nullptr;
  if (!ConvertSidToStringSidW(user->User.Sid, &sidString)) return {};
  std::wstring result(sidString);
  LocalFree(sidString);
  return result;
}

bool verifyOwnerOnlyDacl(PSECURITY_DESCRIPTOR securityDescriptor, const std::wstring& sidText) {
  PSID expectedSid = nullptr;
  PACL dacl = nullptr;
  if (!ConvertStringSidToSidW(sidText.c_str(), &expectedSid)) return false;
  BOOL present = FALSE;
  BOOL defaulted = FALSE;
  if (!GetSecurityDescriptorDacl(securityDescriptor, &present, &dacl, &defaulted) || !present || dacl == nullptr) {
    LocalFree(expectedSid);
    return false;
  }
  ACL_SIZE_INFORMATION info {};
  const bool valid = GetAclInformation(dacl, &info, sizeof(info), AclSizeInformation)
    && info.AceCount == 1;
  bool matches = false;
  if (valid) {
    void* ace = nullptr;
    if (GetAce(dacl, 0, &ace)) {
      const auto* allowed = static_cast<const ACCESS_ALLOWED_ACE*>(ace);
      PSID aceSid = reinterpret_cast<PSID>(const_cast<DWORD*>(&allowed->SidStart));
      matches = allowed->Header.AceType == ACCESS_ALLOWED_ACE_TYPE
        && (allowed->Mask & GENERIC_ALL) == GENERIC_ALL
        && EqualSid(aceSid, expectedSid);
    }
  }
  LocalFree(expectedSid);
  return valid && matches;
}

bool testModeEnabled() {
  const char* value = std::getenv("SERIALSCOPE_TEST_MODE");
  return value != nullptr && std::string(value) == "1";
}

bool isCurrentSessionClient(HANDLE pipe) {
  ULONG clientProcessId = 0;
  DWORD serverSessionId = 0;
  DWORD clientSessionId = 0;
  return GetNamedPipeClientProcessId(pipe, &clientProcessId)
    && ProcessIdToSessionId(GetCurrentProcessId(), &serverSessionId)
    && ProcessIdToSessionId(clientProcessId, &clientSessionId)
    && serverSessionId == clientSessionId;
}

} // namespace

NamedPipeServer::NamedPipeServer(asio::io_context& io, std::wstring pipeName)
  : io_(io),
    pipeName_(std::move(pipeName)),
    serial_(std::make_shared<SerialSession>(io_)),
    ai_(std::make_shared<ai::AiAdapter>()) {
  serial_->setEventHandler([this](Json event) { emitNotification(std::move(event)); });
}

NamedPipeServer::~NamedPipeServer() {
  stop();
}

int NamedPipeServer::run() {
  while (!stopping_) {
    if (!createAndConnect()) {
      if (!stopping_) {
        std::cerr << "Named Pipe 创建或连接失败，错误码：" << GetLastError() << "\n";
        return 2;
      }
      break;
    }

    if (!writeJson({
      {"jsonrpc", "2.0"},
      {"method", "backend.ready"},
      {"params", {{"name", "SerialScope Native Backend"}, {"version", "0.2.0"}, {"transport", "named-pipe"}}}
    })) {
      disconnectClient();
      continue;
    }

    while (!stopping_) {
      HANDLE pipe = INVALID_HANDLE_VALUE;
      {
        std::scoped_lock lock(pipeMutex_);
        pipe = pipe_;
      }
      if (pipe == INVALID_HANDLE_VALUE) break;

      std::array<std::uint8_t, 4> header {};
      DWORD headerBytes = 0;
      DWORD availableBytes = 0;
      if (!PeekNamedPipe(pipe, header.data(), static_cast<DWORD>(header.size()), &headerBytes, &availableBytes, nullptr)) {
        break;
      }
      if (availableBytes < header.size() || headerBytes < header.size()) {
        // Do not leave a synchronous ReadFile pending: serial notifications
        // are written by the Asio thread through this same duplex pipe.
        std::this_thread::sleep_for(std::chrono::milliseconds(4));
        continue;
      }

      const std::uint32_t length = decodeLength(header);
      if (length == 0 || length > kMaxMessageBytes) {
        // 超限长度在读取前拒绝，避免分配任意大小的缓冲；断开后可接受新客户端。
        break;
      }
      if (availableBytes < header.size() + length) {
        std::this_thread::sleep_for(std::chrono::milliseconds(4));
        continue;
      }
      if (!readExact(header.data(), header.size())) break;
      std::string body(length, '\0');
      if (!readExact(body.data(), body.size())) break;

      Json request;
      try {
        request = Json::parse(body);
      } catch (...) {
        if (!writeJson(makeError(nullptr, -32700, "Parse error"))) break;
        continue;
      }

      bool shouldStop = false;
      const Json response = dispatch(request, shouldStop);
      if (!response.is_null() && !writeJson(response)) break;
      if (shouldStop) {
        stop();
        break;
      }
    }
    disconnectClient();
  }
  return 0;
}

void NamedPipeServer::stop() {
  stopping_ = true;
  std::scoped_lock lock(pipeMutex_);
  if (pipe_ != INVALID_HANDLE_VALUE) {
    CancelIoEx(pipe_, nullptr);
    DisconnectNamedPipe(pipe_);
    CloseHandle(pipe_);
    pipe_ = INVALID_HANDLE_VALUE;
  }
}

bool NamedPipeServer::createAndConnect() {
  const std::wstring sid = currentUserSid();
  if (sid.empty()) return false;
  const std::wstring sddl = L"D:P(A;;GA;;;" + sid + L")";
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(
        sddl.c_str(), SDDL_REVISION_1, &descriptor, nullptr)) {
    return false;
  }
  SECURITY_ATTRIBUTES attributes {};
  attributes.nLength = sizeof(attributes);
  attributes.lpSecurityDescriptor = descriptor;
  attributes.bInheritHandle = FALSE;

  if (!verifyOwnerOnlyDacl(descriptor, sid)) {
    LocalFree(descriptor);
    SetLastError(ERROR_ACCESS_DENIED);
    return false;
  }
  HANDLE created = CreateNamedPipeW(
    pipeName_.c_str(),
    PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE | FILE_FLAG_OVERLAPPED,
    PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
    1,
    static_cast<DWORD>(kMaxMessageBytes),
    static_cast<DWORD>(kMaxMessageBytes),
    0,
    &attributes
  );
  LocalFree(descriptor);
  if (created == INVALID_HANDLE_VALUE) return false;

  {
    std::scoped_lock lock(pipeMutex_);
    pipe_ = created;
  }
  HANDLE connectEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  if (connectEvent == nullptr) {
    std::scoped_lock lock(pipeMutex_);
    CloseHandle(pipe_);
    pipe_ = INVALID_HANDLE_VALUE;
    return false;
  }
  OVERLAPPED connectOperation {};
  connectOperation.hEvent = connectEvent;
  BOOL connected = ConnectNamedPipe(created, &connectOperation);
  if (!connected && GetLastError() == ERROR_IO_PENDING) {
    const DWORD wait = WaitForSingleObject(connectEvent, INFINITE);
    DWORD ignored = 0;
    connected = wait == WAIT_OBJECT_0 && GetOverlappedResult(created, &connectOperation, &ignored, FALSE);
  } else if (!connected && GetLastError() == ERROR_PIPE_CONNECTED) {
    connected = TRUE;
  }
  CloseHandle(connectEvent);
  if (!connected) {
    std::scoped_lock lock(pipeMutex_);
    CloseHandle(pipe_);
    pipe_ = INVALID_HANDLE_VALUE;
    return false;
  }
  if (!isCurrentSessionClient(created)) {
    // The DACL restricts users, but a SID is shared by all sessions of that
    // user.  Reject a different local Windows session before any JSON-RPC
    // readiness notification or request is processed.
    DisconnectNamedPipe(created);
    std::scoped_lock lock(pipeMutex_);
    CloseHandle(pipe_);
    pipe_ = INVALID_HANDLE_VALUE;
  }
  return true;
}

void NamedPipeServer::disconnectClient() {
  std::scoped_lock lock(pipeMutex_);
  if (pipe_ != INVALID_HANDLE_VALUE) {
    DisconnectNamedPipe(pipe_);
    CloseHandle(pipe_);
    pipe_ = INVALID_HANDLE_VALUE;
  }
}

bool NamedPipeServer::readExact(void* target, std::size_t size) {
  auto* cursor = static_cast<std::uint8_t*>(target);
  std::size_t remaining = size;
  while (remaining > 0) {
    DWORD read = 0;
    // Keep the server-owned handle alive for the whole overlapped operation.
    // Notification failures can disconnect the client from another thread.
    std::scoped_lock lock(pipeMutex_);
    if (pipe_ == INVALID_HANDLE_VALUE
        || !transferOverlapped(pipe_, cursor, static_cast<DWORD>(remaining), false, 1'000, read)
        || read == 0) {
      return false;
    }
    cursor += read;
    remaining -= read;
  }
  return true;
}

bool NamedPipeServer::writeExact(const void* source, std::size_t size) {
  const auto* cursor = static_cast<const std::uint8_t*>(source);
  std::size_t remaining = size;
  while (remaining > 0) {
    DWORD written = 0;
    if (!transferOverlapped(
          pipe_, const_cast<std::uint8_t*>(cursor), static_cast<DWORD>(remaining), true, kPipeWriteTimeoutMs, written)
        || written == 0) {
      return false;
    }
    cursor += written;
    remaining -= written;
  }
  return true;
}

bool NamedPipeServer::writeJson(const Json& message) {
  const std::string body = dumpJson(message);
  if (body.empty() || body.size() > kMaxMessageBytes) return false;
  const auto header = encodeLength(body.size());
  std::scoped_lock lock(pipeMutex_);
  if (pipe_ == INVALID_HANDLE_VALUE) return false;
  return writeExact(header.data(), header.size()) && writeExact(body.data(), body.size());
}

Json NamedPipeServer::makeError(const Json& id, int code, const std::string& message) {
  return {{"jsonrpc", "2.0"}, {"id", id}, {"error", {{"code", code}, {"message", message}}}};
}

Json NamedPipeServer::dispatch(const Json& request, bool& shouldStop) {
  if (request.is_array()) {
    if (request.empty()) return makeError(nullptr, -32600, "Invalid Request");
    Json responses = Json::array();
    for (const auto& item : request) {
      const Json response = dispatchSingle(item, shouldStop);
      if (!response.is_null()) responses.push_back(response);
    }
    return responses.empty() ? Json() : responses;
  }
  return dispatchSingle(request, shouldStop);
}

Json NamedPipeServer::dispatchSingle(const Json& request, bool& shouldStop) {
  if (!request.is_object() || request.value("jsonrpc", std::string()) != "2.0" || !request.contains("method") || !request.at("method").is_string()) {
    return makeError(nullptr, -32600, "Invalid Request");
  }
  const bool isNotification = !request.contains("id");
  const Json id = isNotification ? Json(nullptr) : request.at("id");
  const std::string method = request.at("method").get<std::string>();
  const Json params = request.value("params", Json::object());
  const bool acceptsAnyParams = method == "backend.ping" || method == "backend.shutdown" || method == "backend.testPayload";
  if (!acceptsAnyParams && !params.is_object()) {
    return isNotification ? Json() : makeError(id, -32602, "Invalid params");
  }
  const bool knownMethod = method == "backend.ping" || method == "backend.shutdown"
    || method == "ports.list" || method == "serial.status" || method == "serial.open" || method == "serial.close" || method == "serial.send"
    || method == "ai.status" || method == "ai.configure" || method == "ai.parseProtocol" || method == "ai.generateCommands"
    || (method == "backend.testPayload" && testModeEnabled());
  if (!knownMethod) return isNotification ? Json() : makeError(id, -32601, "Method not found");

  try {
    const Json result = callSerial(method, params, shouldStop);
    return isNotification ? Json() : Json({{"jsonrpc", "2.0"}, {"id", id}, {"result", result}});
  } catch (const ai::AiError& error) {
    const std::string message = std::string("[") + error.code() + "] " + error.what();
    return isNotification ? Json() : makeError(id, -32000, message);
  } catch (const std::exception& error) {
    return isNotification ? Json() : makeError(id, -32000, error.what());
  }
}

Json NamedPipeServer::callSerial(const std::string& method, const Json& params, bool& shouldStop) {
  if (method == "backend.ping") {
    return {{"name", "SerialScope Native Backend"}, {"version", "0.2.0"}, {"transport", "named-pipe"}};
  }
  if (method == "backend.shutdown") {
    shouldStop = true;
    return {{"ok", true}};
  }
  if (method == "backend.testPayload") {
    if (!testModeEnabled() || !params.is_object() || !params.contains("bytes")
        || !(params.at("bytes").is_number_integer() || params.at("bytes").is_number_unsigned())) {
      throw std::runtime_error("Invalid test payload request");
    }
    const std::uint64_t bytes = params.at("bytes").get<std::uint64_t>();
    if (bytes > kMaxMessageBytes) throw std::runtime_error("Test payload exceeds message boundary");
    return {{"payload", std::string(static_cast<std::size_t>(bytes), 'x')}};
  }

  if (method == "ai.status") {
    return {{"enabled", ai_->enabled()}, {"allowDataUpload", ai_->allowDataUpload()}, {"provider", ai_->providerName()}};
  }
  if (method == "ai.configure") {
    if (!params.is_object()) throw std::runtime_error("Invalid ai.configure params");
    if (params.contains("enabled")) ai_->configure(params.at("enabled").get<bool>(), ai_->allowDataUpload());
    if (params.contains("allowDataUpload")) ai_->configure(ai_->enabled(), params.at("allowDataUpload").get<bool>());
    return {{"enabled", ai_->enabled()}, {"allowDataUpload", ai_->allowDataUpload()}, {"provider", ai_->providerName()}};
  }
  if (method == "ai.parseProtocol") {
    if (!params.is_object() || !params.contains("text") || !params.at("text").is_string()) {
      throw std::runtime_error("Invalid ai.parseProtocol params");
    }
    // AiAdapter::parseProtocol 内部 ensureAuthorized：未启用抛 AiError("not-enabled")，
    // 由 dispatchSingle 的 catch 转成 JSON-RPC error。
    const ai::ProtocolParseResult result = ai_->parseProtocol(params.at("text").get<std::string>());
    Json header = Json::array();
    for (const auto byte : result.header) header.push_back(byte);
    Json fields = Json::array();
    for (const auto& field : result.fields) {
      fields.push_back({{"name", field.name}, {"offset", field.offset}, {"size", field.size}});
    }
    return {{"header", header}, {"lengthFieldOffset", result.lengthFieldOffset},
            {"lengthFieldSize", result.lengthFieldSize}, {"fields", fields}};
  }
  if (method == "ai.generateCommands") {
    if (!params.is_object() || !params.contains("text") || !params.at("text").is_string()) {
      throw std::runtime_error("Invalid ai.generateCommands params");
    }
    // AiAdapter::generateCommands 内部 ensureAuthorized：未启用抛 AiError("not-enabled")。
    const std::vector<ai::CommandSpec> commands =
        ai_->generateCommands(params.at("text").get<std::string>());
    Json list = Json::array();
    for (const auto& command : commands) {
      Json code = Json::array();
      for (const auto byte : command.code) code.push_back(byte);
      list.push_back({{"name", command.name}, {"code", code}, {"description", command.description}});
    }
    return {{"commands", list}};
  }

  auto result = std::make_shared<std::promise<Json>>();
  auto future = result->get_future();
  asio::post(io_, [this, result, method, params] {
    try {
      if (method == "ports.list") result->set_value(listSerialPorts());
      else if (method == "serial.status") result->set_value(serial_->stateJson());
      else if (method == "serial.open") result->set_value(serial_->open(params));
      else if (method == "serial.close") result->set_value(serial_->close());
      else if (method == "serial.send") result->set_value(serial_->sendPayload(params));
      else result->set_exception(std::make_exception_ptr(std::runtime_error("Method not found")));
    } catch (...) {
      result->set_exception(std::current_exception());
    }
  });
  return future.get();
}

void NamedPipeServer::emitNotification(Json event) {
  const std::string type = event.value("type", std::string());
  if (type.empty()) return;
  if (!writeJson({{"jsonrpc", "2.0"}, {"method", notificationMethod(type)}, {"params", event.value("payload", Json::object())}})) {
    std::cerr << "Named Pipe 通知超过消息边界或客户端不可写，已断开客户端\n";
    disconnectClient();
  }
}
