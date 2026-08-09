#include "NamedPipeServer.h"

#include <cstdlib>
#include <iostream>
#include <string>
#include <thread>

#include <boost/asio.hpp>

namespace {

bool hasArg(int argc, char* argv[], const std::string& name) {
  for (int i = 1; i < argc; ++i) {
    if (argv[i] == name) {
      return true;
    }
  }
  return false;
}

std::wstring readPipeName(int argc, char* argv[]) {
  for (int i = 1; i + 1 < argc; ++i) {
    if (std::string(argv[i]) == "--pipe") {
      const std::string value = argv[i + 1];
      return std::wstring(value.begin(), value.end());
    }
  }
  return {};
}

} // namespace

int main(int argc, char* argv[]) {
  if (hasArg(argc, argv, "--version") || hasArg(argc, argv, "-v")) {
    std::cout << "SerialScope Native Backend 0.2.0\n";
    return 0;
  }

  if (hasArg(argc, argv, "--help") || hasArg(argc, argv, "-h") || hasArg(argc, argv, "/?")) {
    std::cout
      << "用法：serialscope-backend.exe --pipe \\\\.\\pipe\\SerialScope.Native.<token>\n"
      << "选项：\n"
      << "  --pipe <name>      Named Pipe 名称（必填）。\n"
      << "  -v, --version      输出后端版本。\n"
      << "  -h, --help         输出帮助信息。\n";
    return 0;
  }

  try {
    const std::wstring pipeName = readPipeName(argc, argv);
    if (pipeName.empty()) {
      std::cerr << "必须提供 --pipe Named Pipe 名称\n";
      return 2;
    }
    boost::asio::io_context io;
    auto work = boost::asio::make_work_guard(io);
    std::thread ioThread([&io] { io.run(); });
    NamedPipeServer server(io, pipeName);
    std::cout << "SerialScope Native backend listening on Named Pipe\n";
    const int result = server.run();
    work.reset();
    io.stop();
    ioThread.join();
    return result;
  } catch (const std::exception& error) {
    std::cerr << "后端异常：" << error.what() << "\n";
    return 1;
  }
}
