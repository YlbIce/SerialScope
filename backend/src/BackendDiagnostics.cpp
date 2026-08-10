#include "BackendDiagnostics.h"

#include <algorithm>
#include <fstream>
#include <vector>

BackendDiagnostics::BackendDiagnostics(std::filesystem::path directory, std::string runId)
  : directory_(std::move(directory)), runId_(std::move(runId)) {
  if (runId_.empty()) runId_ = "unknown";
  std::error_code error;
  std::filesystem::create_directories(directory_, error);
  selectFile();
}

void BackendDiagnostics::selectFile() {
  file_ = directory_ / ("serialscope-backend-" + runId_ + "-" + std::to_string(index_++) + ".jsonl");
  std::error_code error;
  bytes_ = std::filesystem::exists(file_, error) ? static_cast<std::size_t>(std::filesystem::file_size(file_, error)) : 0;
  const std::string prefix = "serialscope-backend-" + runId_ + "-";
  std::vector<std::filesystem::path> files;
  for (const auto& item : std::filesystem::directory_iterator(directory_, error)) {
    const auto name = item.path().filename().string();
    if (name.rfind(prefix, 0) == 0 && item.path().extension() == ".jsonl") files.push_back(item.path());
  }
  std::sort(files.begin(), files.end());
  while (files.size() >= kMaxFiles) {
    std::filesystem::remove(files.front(), error);
    files.erase(files.begin());
  }
}

void BackendDiagnostics::rotateIfNeeded(std::size_t incomingBytes) {
  if (bytes_ > 0 && bytes_ + incomingBytes > kMaxBytes) selectFile();
}

void BackendDiagnostics::log(const std::string& event, const protocol::Json& details) {
  try {
    const protocol::Json entry = {
      {"timestamp", protocol::utcTimestamp()}, {"runId", runId_}, {"source", "backend"},
      {"event", event}, {"details", details}
    };
    const std::string line = entry.dump(-1, ' ', false, nlohmann::json::error_handler_t::replace) + "\n";
    std::scoped_lock lock(mutex_);
    rotateIfNeeded(line.size());
    std::ofstream output(file_, std::ios::app | std::ios::binary);
    output << line;
    bytes_ += line.size();
  } catch (...) {
    // 诊断写入不得影响串口或 Named Pipe 数据面。
  }
}
