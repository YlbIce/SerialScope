#include <Windows.h>

#include <array>
#include <iomanip>
#include <iostream>
#include <string>

int main(int argc, char* argv[]) {
  const std::string portName = argc > 1 ? argv[1] : "COM11";
  const std::string device = "\\\\.\\" + portName;
  HANDLE port = CreateFileA(device.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, 0, nullptr);
  if (port == INVALID_HANDLE_VALUE) {
    std::cerr << "open failed: " << GetLastError() << '\n';
    return 1;
  }
  DCB settings {};
  settings.DCBlength = sizeof(settings);
  if (!GetCommState(port, &settings)) return 2;
  settings.BaudRate = CBR_9600;
  settings.ByteSize = 8;
  settings.Parity = NOPARITY;
  settings.StopBits = ONESTOPBIT;
  if (!SetCommState(port, &settings)) return 3;
  COMMTIMEOUTS timeouts {};
  timeouts.ReadIntervalTimeout = 1000;
  timeouts.ReadTotalTimeoutConstant = 5000;
  if (!SetCommTimeouts(port, &timeouts)) return 4;
  std::array<std::uint8_t, 2> bytes {};
  DWORD read = 0;
  const bool ok = ReadFile(port, bytes.data(), static_cast<DWORD>(bytes.size()), &read, nullptr) && read == bytes.size();
  CloseHandle(port);
  if (!ok) return 5;
  std::cout << std::uppercase << std::hex << std::setfill('0');
  for (std::size_t i = 0; i < bytes.size(); ++i) {
    if (i != 0) std::cout << ' ';
    std::cout << std::setw(2) << static_cast<int>(bytes[i]);
  }
  std::cout << '\n';
  return 0;
}
