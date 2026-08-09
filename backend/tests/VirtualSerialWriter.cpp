#include <Windows.h>

#include <cstdlib>
#include <iostream>
#include <string>
#include <vector>

int main(int argc, char* argv[]) {
  const std::string portName = argc > 1 ? argv[1] : "COM11";
  std::size_t count = 2;
  unsigned long baudRate = CBR_9600;
  if (argc > 2) {
    char* end = nullptr;
    const unsigned long parsed = std::strtoul(argv[2], &end, 10);
    if (end == argv[2] || *end != '\0' || parsed == 0 || parsed > 1024 * 1024) {
      std::cerr << "byte count must be between 1 and 1048576\n";
      return 10;
    }
    count = static_cast<std::size_t>(parsed);
  }
  if (argc > 3) {
    char* end = nullptr;
    baudRate = std::strtoul(argv[3], &end, 10);
    if (end == argv[3] || *end != '\0' || baudRate < 110 || baudRate > 4'000'000) {
      std::cerr << "baud rate must be between 110 and 4000000\n";
      return 11;
    }
  }
  const std::string device = "\\\\.\\" + portName;
  HANDLE port = CreateFileA(device.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, 0, nullptr);
  if (port == INVALID_HANDLE_VALUE) {
    std::cerr << "open failed: " << GetLastError() << '\n';
    return 1;
  }
  DCB settings {};
  settings.DCBlength = sizeof(settings);
  if (!GetCommState(port, &settings)) return 2;
  settings.BaudRate = baudRate;
  settings.ByteSize = 8;
  settings.Parity = NOPARITY;
  settings.StopBits = ONESTOPBIT;
  if (!SetCommState(port, &settings)) return 3;
  std::vector<std::uint8_t> bytes(count);
  for (std::size_t index = 0; index < bytes.size(); ++index) {
    bytes[index] = count == 2 ? static_cast<std::uint8_t>(index == 0 ? 0x41 : 0x42)
                              : static_cast<std::uint8_t>(index & 0xFF);
  }
  DWORD written = 0;
  const bool ok = WriteFile(port, bytes.data(), static_cast<DWORD>(bytes.size()), &written, nullptr)
    && written == bytes.size();
  CloseHandle(port);
  if (!ok) return 4;
  if (count == 2) std::cout << "41 42\n";
  else std::cout << count << "\n";
  return 0;
}
