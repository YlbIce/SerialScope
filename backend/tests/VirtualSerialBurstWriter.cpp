#include <Windows.h>

#include <cstdlib>
#include <iostream>
#include <string>
#include <vector>

int main(int argc, char* argv[]) {
  const std::string portName = argc > 1 ? argv[1] : "COM11";
  const int frames = argc > 2 ? std::atoi(argv[2]) : 1000;
  const unsigned long baudRate = argc > 3 ? std::strtoul(argv[3], nullptr, 10) : 921600;
  if (frames < 1 || frames > 100000 || baudRate < 110 || baudRate > 4000000) return 10;
  const std::string device = "\\\\.\\" + portName;
  HANDLE port = CreateFileA(device.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, 0, nullptr);
  if (port == INVALID_HANDLE_VALUE) { std::cerr << "open failed: " << GetLastError() << '\n'; return 1; }
  DCB settings {}; settings.DCBlength = sizeof(settings);
  if (!GetCommState(port, &settings)) return 2;
  settings.BaudRate = baudRate; settings.ByteSize = 8; settings.Parity = NOPARITY; settings.StopBits = ONESTOPBIT;
  if (!SetCommState(port, &settings)) return 3;
  std::vector<std::uint8_t> bytes;
  bytes.reserve(static_cast<std::size_t>(frames) * 5);
  for (int index = 0; index < frames; ++index) {
    // The load scenario uses LF framing, so test payload bytes must not embed
    // 0x0A: otherwise a valid delimiter decoder quite correctly splits them.
    bytes.push_back(0xAA); bytes.push_back(0x55);
    bytes.push_back(static_cast<std::uint8_t>('0' + ((index / 26) % 10)));
    bytes.push_back(static_cast<std::uint8_t>('A' + (index % 26))); bytes.push_back('\n');
  }
  DWORD written = 0;
  // WriteFile only queues bytes to the local serial driver.  Drain that queue
  // before closing the virtual endpoint so the load test measures the
  // receiver rather than losing the trailing bytes during writer teardown.
  const bool ok = WriteFile(port, bytes.data(), static_cast<DWORD>(bytes.size()), &written, nullptr)
    && written == bytes.size()
    && FlushFileBuffers(port);
  CloseHandle(port);
  if (!ok) return 4;
  std::cout << frames << '\n';
  return 0;
}
