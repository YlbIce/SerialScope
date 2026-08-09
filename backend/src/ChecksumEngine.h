#pragma once

#include "ProtocolUtils.h"

#include <cstdint>
#include <string>
#include <vector>

namespace protocol {

enum class ChecksumType {
  NONE,
  CRC8,
  CRC16_MODBUS,
  CRC16_CCITT,
  CRC16_XMODEM,
  CRC32,
  SUM8,
  SUM16_LE,
  SUM16_BE,
  XOR,
  LRC,
};

class ChecksumEngine final {
public:
  // 计算给定数据域的校验字节序列。
  // 未知/非法类型返回空校验字节，不抛异常。
  static Bytes calculate(const Bytes& data, ChecksumType type);

  // 把校验字节追加到 frame 末尾（小端优先，与 Modbus 一致）。
  // NONE 追加空字节。
  static void append(Bytes& frame, ChecksumType type);

  // 按 checksumOffset/checksumSize 从 frame 提取校验字节，与
  // calculate(frame[0, checksumOffset)) 逐字节比对。
  // 越界、未知类型返回 false；NONE 恒返回 true。
  static bool verify(const Bytes& frame, ChecksumType type,
                     std::size_t checksumOffset, std::size_t checksumSize);

  static const char* name(ChecksumType type);
  static ChecksumType fromName(const std::string& name);

  // 返回算法输出的校验字节长度；NONE/未知返回 0。
  static std::size_t width(ChecksumType type);
};

} // namespace protocol
