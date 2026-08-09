#include "ChecksumEngine.h"

#include <algorithm>
#include <cstdint>

namespace protocol {

namespace {

const char* kChecksumNames[] = {
    "NONE",           "CRC8",       "CRC16_MODBUS",
    "CRC16_CCITT",    "CRC16_XMODEM", "CRC32",
    "SUM8",           "SUM16_LE",   "SUM16_BE",
    "XOR",            "LRC",
};

std::uint8_t crc8(const Bytes& data) {
  // 多项式 0x07，init 0x00，refin=false，refout=false，xorout=0x00。
  std::uint8_t crc = 0x00;
  for (const auto byte : data) {
    crc ^= byte;
    for (int bit = 0; bit < 8; ++bit) {
      if ((crc & 0x80) != 0) {
        crc = static_cast<std::uint8_t>((crc << 1) ^ 0x07);
      } else {
        crc = static_cast<std::uint8_t>(crc << 1);
      }
    }
  }
  return crc;
}

std::uint16_t crc16CcitOrXmodem(const Bytes& data, std::uint16_t init) {
  // 多项式 0x1021，refin=false，refout=false，xorout=0x0000。
  std::uint16_t crc = init;
  for (const auto byte : data) {
    crc ^= static_cast<std::uint16_t>(byte) << 8;
    for (int bit = 0; bit < 8; ++bit) {
      if ((crc & 0x8000) != 0) {
        crc = static_cast<std::uint16_t>((crc << 1) ^ 0x1021);
      } else {
        crc = static_cast<std::uint16_t>(crc << 1);
      }
    }
  }
  return crc;
}

std::uint32_t crc32Ieee(const Bytes& data) {
  // IEEE 802.3：多项式 0x04C11DB7，init 0xFFFFFFFF，refin=true，refout=true，xorout=0xFFFFFFFF。
  std::uint32_t crc = 0xFFFFFFFFu;
  for (const auto byte : data) {
    crc ^= byte;
    for (int bit = 0; bit < 8; ++bit) {
      if ((crc & 0x01) != 0) {
        crc = (crc >> 1) ^ 0xEDB88320u;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc ^ 0xFFFFFFFFu;
}

std::uint8_t sum8(const Bytes& data) {
  std::uint16_t sum = 0;
  for (const auto byte : data) {
    sum = static_cast<std::uint16_t>((sum + byte) & 0xFF);
  }
  return static_cast<std::uint8_t>(sum);
}

std::uint16_t sum16(const Bytes& data) {
  std::uint32_t sum = 0;
  for (const auto byte : data) {
    sum = (sum + byte) & 0xFFFF;
  }
  return static_cast<std::uint16_t>(sum);
}

std::uint8_t xorSum(const Bytes& data) {
  std::uint8_t result = 0;
  for (const auto byte : data) {
    result ^= byte;
  }
  return result;
}

std::uint8_t lrc(const Bytes& data) {
  const std::uint8_t sum = sum8(data);
  return static_cast<std::uint8_t>(0x100 - static_cast<int>(sum));
}

} // namespace

Bytes ChecksumEngine::calculate(const Bytes& data, ChecksumType type) {
  switch (type) {
    case ChecksumType::NONE:
      return {};
    case ChecksumType::CRC8:
      return {crc8(data)};
    case ChecksumType::CRC16_MODBUS: {
      const std::uint16_t value = crc16Modbus(data);
      return {static_cast<std::uint8_t>(value & 0xFF),
              static_cast<std::uint8_t>((value >> 8) & 0xFF)};
    }
    case ChecksumType::CRC16_CCITT: {
      const std::uint16_t value = crc16CcitOrXmodem(data, 0xFFFF);
      return {static_cast<std::uint8_t>((value >> 8) & 0xFF),
              static_cast<std::uint8_t>(value & 0xFF)};
    }
    case ChecksumType::CRC16_XMODEM: {
      const std::uint16_t value = crc16CcitOrXmodem(data, 0x0000);
      return {static_cast<std::uint8_t>((value >> 8) & 0xFF),
              static_cast<std::uint8_t>(value & 0xFF)};
    }
    case ChecksumType::CRC32: {
      const std::uint32_t value = crc32Ieee(data);
      return {static_cast<std::uint8_t>(value & 0xFF),
              static_cast<std::uint8_t>((value >> 8) & 0xFF),
              static_cast<std::uint8_t>((value >> 16) & 0xFF),
              static_cast<std::uint8_t>((value >> 24) & 0xFF)};
    }
    case ChecksumType::SUM8:
      return {sum8(data)};
    case ChecksumType::SUM16_LE: {
      const std::uint16_t value = sum16(data);
      return {static_cast<std::uint8_t>(value & 0xFF),
              static_cast<std::uint8_t>((value >> 8) & 0xFF)};
    }
    case ChecksumType::SUM16_BE: {
      const std::uint16_t value = sum16(data);
      return {static_cast<std::uint8_t>((value >> 8) & 0xFF),
              static_cast<std::uint8_t>(value & 0xFF)};
    }
    case ChecksumType::XOR:
      return {xorSum(data)};
    case ChecksumType::LRC:
      return {lrc(data)};
  }
  return {};
}

void ChecksumEngine::append(Bytes& frame, ChecksumType type) {
  const Bytes bytes = calculate(frame, type);
  frame.insert(frame.end(), bytes.begin(), bytes.end());
}

bool ChecksumEngine::verify(const Bytes& frame, ChecksumType type,
                            std::size_t checksumOffset, std::size_t checksumSize) {
  if (type == ChecksumType::NONE) {
    return true;
  }
  if (checksumOffset + checksumSize > frame.size()) {
    return false;
  }
  const Bytes expected = calculate(
      Bytes(frame.begin(), frame.begin() + static_cast<std::ptrdiff_t>(checksumOffset)),
      type);
  if (expected.size() != checksumSize) {
    return false;
  }
  return std::equal(expected.begin(), expected.end(),
                    frame.begin() + static_cast<std::ptrdiff_t>(checksumOffset));
}

const char* ChecksumEngine::name(ChecksumType type) {
  const auto index = static_cast<std::size_t>(type);
  if (index >= (sizeof(kChecksumNames) / sizeof(kChecksumNames[0]))) {
    return "UNKNOWN";
  }
  return kChecksumNames[index];
}

ChecksumType ChecksumEngine::fromName(const std::string& name) {
  const std::size_t count = sizeof(kChecksumNames) / sizeof(kChecksumNames[0]);
  for (std::size_t i = 0; i < count; ++i) {
    if (name == kChecksumNames[i]) {
      return static_cast<ChecksumType>(i);
    }
  }
  // 未知名称对应 NONE（索引 0），由调用方决定是否接受；这里返回 NONE 以保持幂等。
  return ChecksumType::NONE;
}

std::size_t ChecksumEngine::width(ChecksumType type) {
  switch (type) {
    case ChecksumType::NONE:
      return 0;
    case ChecksumType::CRC8:
    case ChecksumType::SUM8:
    case ChecksumType::XOR:
    case ChecksumType::LRC:
      return 1;
    case ChecksumType::CRC16_MODBUS:
    case ChecksumType::CRC16_CCITT:
    case ChecksumType::CRC16_XMODEM:
    case ChecksumType::SUM16_LE:
    case ChecksumType::SUM16_BE:
      return 2;
    case ChecksumType::CRC32:
      return 4;
  }
  return 0;
}

} // namespace protocol
