#include "ProtocolUtils.h"

#include <algorithm>
#include <chrono>
#include <iomanip>
#include <sstream>

namespace protocol {

std::string bytesToHex(const Bytes& data) {
  std::ostringstream stream;
  stream << std::uppercase << std::hex << std::setfill('0');
  for (std::size_t i = 0; i < data.size(); ++i) {
    if (i != 0) {
      stream << ' ';
    }
    stream << std::setw(2) << static_cast<int>(data[i]);
  }
  return stream.str();
}

bool hexToBytes(const std::string& input, Bytes& output, std::string& error) {
  std::string normalized;
  normalized.reserve(input.size());
  for (std::size_t i = 0; i < input.size(); ++i) {
    const unsigned char ch = static_cast<unsigned char>(input[i]);
    if (std::isspace(ch) || ch == ',' || ch == ';' || ch == ':' || ch == '_' || ch == '-') {
      continue;
    }
    if (ch == '0' && i + 1 < input.size() && (input[i + 1] == 'x' || input[i + 1] == 'X')) {
      ++i;
      continue;
    }
    normalized.push_back(static_cast<char>(ch));
  }

  if (normalized.empty()) {
    output.clear();
    return true;
  }

  if ((normalized.size() % 2) != 0) {
    error = "HEX 长度必须是偶数";
    return false;
  }

  Bytes bytes;
  bytes.reserve(normalized.size() / 2);
  for (std::size_t i = 0; i < normalized.size(); i += 2) {
    const std::string part = normalized.substr(i, 2);
    char* end = nullptr;
    const long value = std::strtol(part.c_str(), &end, 16);
    if (end == nullptr || *end != '\0' || value < 0 || value > 255) {
      error = "非法 HEX 字符：" + part;
      return false;
    }
    bytes.push_back(static_cast<std::uint8_t>(value));
  }

  output = std::move(bytes);
  return true;
}

Bytes textToBytes(const std::string& text, const std::string& lineEnding) {
  Bytes data(text.begin(), text.end());
  if (lineEnding == "CR") {
    data.push_back('\r');
  } else if (lineEnding == "LF") {
    data.push_back('\n');
  } else if (lineEnding == "CRLF") {
    data.push_back('\r');
    data.push_back('\n');
  }
  return data;
}

std::uint16_t crc16Modbus(const Bytes& data) {
  std::uint16_t crc = 0xFFFF;
  for (const auto byte : data) {
    crc ^= byte;
    for (int bit = 0; bit < 8; ++bit) {
      if ((crc & 0x0001) != 0) {
        crc = static_cast<std::uint16_t>((crc >> 1) ^ 0xA001);
      } else {
        crc = static_cast<std::uint16_t>(crc >> 1);
      }
    }
  }
  return crc;
}

void appendModbusCrc(Bytes& data) {
  const std::uint16_t crc = crc16Modbus(data);
  data.push_back(static_cast<std::uint8_t>(crc & 0xFF));
  data.push_back(static_cast<std::uint8_t>((crc >> 8) & 0xFF));
}

std::string bytesToDisplayText(const Bytes& data) {
  std::string result;
  result.reserve(data.size());
  char buffer[8] = {};
  for (const auto byte : data) {
    if (byte == '\r') {
      result += "\\r";
    } else if (byte == '\n') {
      result += "\\n";
    } else if (byte == '\t') {
      result += "\\t";
    } else if (byte < 0x20 || byte == 0x7F) {
      std::snprintf(buffer, sizeof(buffer), "\\x%02X", byte);
      result += buffer;
    } else {
      result.push_back(static_cast<char>(byte));
    }
  }
  return result;
}

std::string utcTimestamp() {
  const auto now = std::chrono::system_clock::now();
  const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
  const std::time_t time = std::chrono::system_clock::to_time_t(now);
  std::tm tm {};
  gmtime_s(&tm, &time);

  std::ostringstream stream;
  stream << std::put_time(&tm, "%Y-%m-%dT%H:%M:%S")
         << '.' << std::setw(3) << std::setfill('0') << ms.count() << 'Z';
  return stream.str();
}

Json makeError(const std::string& requestId, const std::string& message) {
  return {
    {"type", "error"},
    {"requestId", requestId},
    {"payload", {{"message", message}}}
  };
}

Json makeOk(const std::string& requestId, const std::string& type, const Json& payload) {
  return {
    {"type", type},
    {"requestId", requestId},
    {"payload", payload}
  };
}

} // namespace protocol
