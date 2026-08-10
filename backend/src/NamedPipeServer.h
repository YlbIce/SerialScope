#pragma once

#include "AiAdapter.h"
#include "SerialSession.h"

#include <atomic>
#include <memory>
#include <mutex>
#include <string>

#include <Windows.h>
#include <boost/asio.hpp>

class NamedPipeServer final {
public:
  static constexpr std::size_t kMaxMessageBytes = 4 * 1024 * 1024;
  static constexpr DWORD kPipeWriteTimeoutMs = 2'000;

  NamedPipeServer(boost::asio::io_context& io, std::wstring pipeName, std::shared_ptr<class BackendDiagnostics> diagnostics = nullptr);
  ~NamedPipeServer();

  NamedPipeServer(const NamedPipeServer&) = delete;
  NamedPipeServer& operator=(const NamedPipeServer&) = delete;

  // 阻塞接受循环；调用者应在独立线程运行 Asio io_context。
  int run();
  void stop();

private:
  bool createAndConnect();
  void disconnectClient();
  bool readExact(void* target, std::size_t size);
  bool writeExact(const void* source, std::size_t size);
  bool writeJson(const protocol::Json& message);
  protocol::Json dispatch(const protocol::Json& request, bool& shouldStop);
  protocol::Json dispatchSingle(const protocol::Json& request, bool& shouldStop);
  protocol::Json callSerial(const std::string& method, const protocol::Json& params, bool& shouldStop);
  void emitNotification(protocol::Json event);
  static protocol::Json makeError(const protocol::Json& id, int code, const std::string& message);

  boost::asio::io_context& io_;
  std::wstring pipeName_;
  std::shared_ptr<SerialSession> serial_;
  std::shared_ptr<ai::AiAdapter> ai_;
  std::shared_ptr<class BackendDiagnostics> diagnostics_;
  std::atomic_bool stopping_ {false};
  std::mutex pipeMutex_;
  HANDLE pipe_ = INVALID_HANDLE_VALUE;
};
