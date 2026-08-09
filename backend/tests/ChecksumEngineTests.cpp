#include "ChecksumEngine.h"
#include "ProtocolUtils.h"

#include <cstdlib>
#include <iostream>
#include <string>

namespace {

using protocol::Bytes;
using protocol::ChecksumEngine;
using protocol::ChecksumType;

void require(bool condition, const std::string& message) {
  if (!condition) {
    std::cerr << "FAILED: " << message << '\n';
    std::exit(1);
  }
}

Bytes asciiBytes(const char* text) {
  Bytes result;
  for (const char* p = text; *p != '\0'; ++p) {
    result.push_back(static_cast<std::uint8_t>(*p));
  }
  return result;
}

} // namespace

int main() {
  // 1. 标准向量
  require(ChecksumEngine::calculate({0x01, 0x02, 0x03}, ChecksumType::CRC8) ==
              Bytes({0x48}),
          "CRC8 标准向量");
  require(ChecksumEngine::calculate({0x01, 0x03, 0x00, 0x00, 0x00, 0x01}, ChecksumType::CRC16_MODBUS) ==
              Bytes({0x84, 0x0A}),
          "CRC16_MODBUS 标准向量");
  require(ChecksumEngine::calculate(asciiBytes("123456789"), ChecksumType::CRC16_CCITT) ==
              Bytes({0x29, 0xB1}),
          "CRC16_CCITT 标准向量");
  require(ChecksumEngine::calculate(asciiBytes("123456789"), ChecksumType::CRC16_XMODEM) ==
              Bytes({0x31, 0xC3}),
          "CRC16_XMODEM 标准向量");
  require(ChecksumEngine::calculate(asciiBytes("123456789"), ChecksumType::CRC32) ==
              Bytes({0x26, 0x39, 0xF4, 0xCB}),
          "CRC32 IEEE 标准向量");
  require(ChecksumEngine::calculate({0x01, 0x02, 0x03}, ChecksumType::SUM8) == Bytes({0x06}),
          "SUM8");
  require(ChecksumEngine::calculate({0x01, 0x02, 0x03, 0x04}, ChecksumType::SUM16_LE) ==
              Bytes({0x0A, 0x00}),
          "SUM16_LE");
  require(ChecksumEngine::calculate({0x01, 0x02, 0x03, 0x04}, ChecksumType::SUM16_BE) ==
              Bytes({0x00, 0x0A}),
          "SUM16_BE");
  require(ChecksumEngine::calculate({0xAA, 0x55}, ChecksumType::XOR) == Bytes({0xFF}), "XOR");
  require(ChecksumEngine::calculate({0x01, 0x02, 0x03}, ChecksumType::LRC) == Bytes({0xFA}), "LRC");
  require(ChecksumEngine::calculate({0x01, 0x02}, ChecksumType::NONE).empty(), "NONE 空校验");

  // 2. append/verify round-trip + 篡改检测（CRC16_MODBUS）
  Bytes frame = {0x01, 0x04, 0x00, 0x01};
  ChecksumEngine::append(frame, ChecksumType::CRC16_MODBUS);
  require(frame == Bytes({0x01, 0x04, 0x00, 0x01, 0x81, 0xD9}), "append 追加校验字节");
  require(ChecksumEngine::verify(frame, ChecksumType::CRC16_MODBUS, frame.size() - 2, 2),
          "verify round-trip 通过");
  Bytes tampered = frame;
  tampered.back() = 0xD8;
  require(!ChecksumEngine::verify(tampered, ChecksumType::CRC16_MODBUS, tampered.size() - 2, 2),
          "篡改一字节后 verify 不通过");

  // 3. 与现有 Modbus 入口一致
  const Bytes modbusPayload = {0x01, 0x04, 0x00, 0x01};
  const std::uint16_t expected = protocol::crc16Modbus(modbusPayload);
  require(ChecksumEngine::calculate(modbusPayload, ChecksumType::CRC16_MODBUS) ==
              Bytes({static_cast<std::uint8_t>(expected & 0xFF),
                     static_cast<std::uint8_t>((expected >> 8) & 0xFF)}),
          "CRC16_MODBUS 与 crc16Modbus 一致");

  // 4. 防御性
  require(ChecksumEngine::verify(frame, ChecksumType::NONE, 0, 0), "NONE verify 恒通过");
  require(ChecksumEngine::verify(frame, ChecksumType::NONE, 0, 1), "NONE verify 忽略偏移");
  require(ChecksumEngine::calculate(Bytes{}, static_cast<ChecksumType>(999)).empty(),
          "非法类型 calculate 返回空");
  require(!ChecksumEngine::verify({0x01}, ChecksumType::CRC16_MODBUS, 10, 2),
          "校验域越界 verify 不通过");
  require(!ChecksumEngine::verify(frame, ChecksumType::CRC16_MODBUS, frame.size() - 2, 3),
          "校验尺寸越界返回 false");
  require(!ChecksumEngine::verify(frame, ChecksumType::CRC16_MODBUS, frame.size() - 1, 2),
          "校验域重叠到末尾越界返回 false");

  // 5. 名称映射与宽度
  require(std::string(ChecksumEngine::name(ChecksumType::CRC16_MODBUS)) == "CRC16_MODBUS",
          "name 映射");
  require(ChecksumEngine::fromName("CRC32") == ChecksumType::CRC32, "fromName 映射");
  require(ChecksumEngine::width(ChecksumType::CRC8) == 1, "CRC8 宽度 1");
  require(ChecksumEngine::width(ChecksumType::CRC16_MODBUS) == 2, "CRC16 宽度 2");
  require(ChecksumEngine::width(ChecksumType::CRC32) == 4, "CRC32 宽度 4");
  require(ChecksumEngine::width(ChecksumType::NONE) == 0, "NONE 宽度 0");

  std::cout << "ChecksumEngine tests passed\n";
  return 0;
}
