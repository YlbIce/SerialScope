#pragma once

#include "ProtocolUtils.h"

#include <cstddef>
#include <filesystem>
#include <mutex>
#include <string>

class BackendDiagnostics final {
public:
  BackendDiagnostics(std::filesystem::path directory, std::string runId);
  void log(const std::string& event, const protocol::Json& details = protocol::Json::object());

private:
  void rotateIfNeeded(std::size_t incomingBytes);
  void selectFile();

  static constexpr std::size_t kMaxBytes = 5 * 1024 * 1024;
  static constexpr std::size_t kMaxFiles = 5;
  std::filesystem::path directory_;
  std::string runId_;
  std::filesystem::path file_;
  std::size_t bytes_ = 0;
  std::size_t index_ = 0;
  std::mutex mutex_;
};
