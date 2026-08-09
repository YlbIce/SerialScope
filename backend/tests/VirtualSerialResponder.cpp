#include <Windows.h>

#include <array>
#include <cstdint>
#include <iostream>
#include <string>

namespace {

bool configure(HANDLE port) {
  DCB settings {};
  settings.DCBlength = sizeof(settings);
  if (!GetCommState(port, &settings)) return false;
  settings.BaudRate = CBR_9600;
  settings.ByteSize = 8;
  settings.Parity = NOPARITY;
  settings.StopBits = ONESTOPBIT;
  if (!SetCommState(port, &settings)) return false;
  COMMTIMEOUTS timeouts {};
  timeouts.ReadIntervalTimeout = 100;
  timeouts.ReadTotalTimeoutConstant = 3000;
  return SetCommTimeouts(port, &timeouts) != FALSE;
}

bool readExact(HANDLE port, std::uint8_t* destination, std::size_t size) {
  std::size_t offset = 0;
  while (offset < size) {
    DWORD read = 0;
    if (!ReadFile(port, destination + offset, static_cast<DWORD>(size - offset), &read, nullptr) || read == 0) return false;
    offset += read;
  }
  return true;
}

} // namespace

int main(int argc, char* argv[]) {
  const std::string portName = argc > 1 ? argv[1] : "COM10";
  const int responseCount = argc > 2 ? std::atoi(argv[2]) : 20;
  const bool untilIdle = responseCount == 0;
  const std::string device = "\\\\.\\" + portName;
  HANDLE port = CreateFileA(device.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, 0, nullptr);
  if (port == INVALID_HANDLE_VALUE) {
    std::cerr << "open failed: " << GetLastError() << '\n';
    return 1;
  }
  if (!configure(port)) {
    CloseHandle(port);
    return 2;
  }

  const std::array<std::uint8_t, 9> response {0x01, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0xFA, 0x33};
  std::array<std::uint8_t, 8> request {};
  int answered = 0;
  while (untilIdle || answered < responseCount) {
    if (!readExact(port, request.data(), request.size())) {
      if (untilIdle) break;
      CloseHandle(port);
      return 3;
    }
    DWORD written = 0;
    if (!WriteFile(port, response.data(), static_cast<DWORD>(response.size()), &written, nullptr) || written != response.size()) {
      CloseHandle(port);
      return 4;
    }
    answered += 1;
  }
  CloseHandle(port);
  std::cout << answered << '\n';
  return 0;
}
