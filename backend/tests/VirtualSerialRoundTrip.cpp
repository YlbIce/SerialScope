#include <Windows.h>

#include <cctype>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <string>
#include <vector>

namespace {

bool parseHex(const std::string& source, std::vector<std::uint8_t>& bytes) {
  std::string compact;
  for (const char character : source) {
    if (!std::isspace(static_cast<unsigned char>(character))) compact.push_back(character);
  }
  if (compact.empty() || compact.size() % 2 != 0) return false;
  bytes.clear();
  for (std::size_t index = 0; index < compact.size(); index += 2) {
    const auto hexValue = compact.substr(index, 2);
    char* end = nullptr;
    const auto value = std::strtoul(hexValue.c_str(), &end, 16);
    if (*end != '\0' || value > 0xFF) return false;
    bytes.push_back(static_cast<std::uint8_t>(value));
  }
  return true;
}

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
  timeouts.ReadTotalTimeoutConstant = 5000;
  return SetCommTimeouts(port, &timeouts) != FALSE;
}

} // namespace

int main(int argc, char* argv[]) {
  const std::string portName = argc > 1 ? argv[1] : "COM10";
  const std::string requestText = argc > 2 ? argv[2] : "41 42";
  const std::string expectedText = argc > 3 ? argv[3] : "CA FE";
  std::vector<std::uint8_t> request;
  std::vector<std::uint8_t> expected;
  if (!parseHex(requestText, request) || !parseHex(expectedText, expected)) {
    std::cerr << "request and expected values must be complete hexadecimal bytes\n";
    return 10;
  }

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
  DWORD written = 0;
  if (!WriteFile(port, request.data(), static_cast<DWORD>(request.size()), &written, nullptr) || written != request.size()) {
    CloseHandle(port);
    return 3;
  }
  std::vector<std::uint8_t> received(expected.size());
  std::size_t offset = 0;
  while (offset < received.size()) {
    DWORD read = 0;
    if (!ReadFile(port, received.data() + offset, static_cast<DWORD>(received.size() - offset), &read, nullptr) || read == 0) {
      CloseHandle(port);
      return 4;
    }
    offset += read;
  }
  if (received != expected) return 5;
  COMMTIMEOUTS quietTimeout {};
  quietTimeout.ReadIntervalTimeout = 50;
  quietTimeout.ReadTotalTimeoutConstant = 250;
  if (!SetCommTimeouts(port, &quietTimeout)) {
    CloseHandle(port);
    return 6;
  }
  std::uint8_t unexpected = 0;
  DWORD extraRead = 0;
  const bool extraReceived = ReadFile(port, &unexpected, 1, &extraRead, nullptr) && extraRead != 0;
  CloseHandle(port);
  if (extraReceived) {
    std::cerr << "unexpected duplicate response byte\n";
    return 7;
  }
  std::cout << std::uppercase << std::hex << std::setfill('0');
  for (std::size_t index = 0; index < received.size(); ++index) {
    if (index != 0) std::cout << ' ';
    std::cout << std::setw(2) << static_cast<int>(received[index]);
  }
  std::cout << '\n';
  return 0;
}
