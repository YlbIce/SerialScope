#include <Windows.h>

#include <array>
#include <cstdlib>
#include <iostream>
#include <string>

namespace {

bool writeRequest(HANDLE pipe, const std::string& id, unsigned long payloadBytes) {
  const std::string body = "{\"jsonrpc\":\"2.0\",\"id\":\"" + id
    + "\",\"method\":\"backend.testPayload\",\"params\":{\"bytes\":"
    + std::to_string(payloadBytes) + "}}";
  const std::array<std::uint8_t, 4> header {
    static_cast<std::uint8_t>(body.size() & 0xFF),
    static_cast<std::uint8_t>((body.size() >> 8) & 0xFF),
    static_cast<std::uint8_t>((body.size() >> 16) & 0xFF),
    static_cast<std::uint8_t>((body.size() >> 24) & 0xFF)
  };
  DWORD written = 0;
  return WriteFile(pipe, header.data(), static_cast<DWORD>(header.size()), &written, nullptr)
    && written == header.size()
    && WriteFile(pipe, body.data(), static_cast<DWORD>(body.size()), &written, nullptr)
    && written == body.size();
}

} // namespace

int main(int argc, char* argv[]) {
  if (argc != 3) {
    std::cerr << "usage: serialscope-named-pipe-slow-client <pipe-name> <payload-bytes>\n";
    return 10;
  }
  char* end = nullptr;
  const unsigned long payloadBytes = std::strtoul(argv[2], &end, 10);
  if (end == argv[2] || *end != '\0') return 11;

  if (!WaitNamedPipeA(argv[1], 5'000)) {
    std::cerr << "pipe not ready: " << GetLastError() << '\n';
    return 1;
  }
  HANDLE pipe = CreateFileA(argv[1], GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, 0, nullptr);
  if (pipe == INVALID_HANDLE_VALUE) {
    std::cerr << "open failed: " << GetLastError() << '\n';
    return 1;
  }
  const bool first = writeRequest(pipe, "slow-one", payloadBytes);
  Sleep(100);
  const bool second = writeRequest(pipe, "slow-two", payloadBytes);
  // Intentionally never call ReadFile: the server must not block indefinitely
  // while this peer leaves its outbound response unread.
  Sleep(4'000);
  CloseHandle(pipe);
  if (!first || !second) {
    std::cerr << "request write failed\n";
    return 2;
  }
  return 0;
}
