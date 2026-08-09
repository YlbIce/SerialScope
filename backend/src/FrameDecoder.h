#pragma once

#include "ProtocolUtils.h"

#include <array>
#include <cstddef>
#include <vector>

enum class FrameMode { Raw, Delimiter, Fixed, Length };

enum class LengthEndian { Little, Big };

struct FrameDecoderConfig {
  FrameMode mode = FrameMode::Raw;
  protocol::Bytes delimiter;
  std::size_t frameSize = 0;
  // Length 模式：
  protocol::Bytes header;                    // 帧头特征码
  std::size_t lengthFieldOffset = 0;         // 长度域相对帧起始（含 header）的偏移
  std::size_t lengthFieldSize = 0;           // 长度域字节数（1/2/4）
  bool lengthIncludesHeader = false;         // 长度值是否包含 header 与长度域本身
  LengthEndian lengthEndian = LengthEndian::Little;
  std::size_t minFrameSize = 0;              // 最小帧长（0 表示不限制）
  std::size_t maxFrameSize = 0;              // 最大帧长（0 表示不限制，但受缓冲上限约束）
  std::size_t maxBufferedBytes = 1024 * 1024;
};

struct FrameDecodeResult {
  std::vector<protocol::Bytes> frames;
  bool overflowed = false;
};

class FrameDecoder final {
public:
  static constexpr std::size_t kMaxBufferedBytes = 1024 * 1024;
  // 一条传输事件同时包含 text 与 hex 表示；限制定长帧以保证最坏情况仍可放入 4 MiB Named Pipe 消息边界。
  static constexpr std::size_t kMaxFixedFrameBytes = 128 * 1024;

  void configure(FrameDecoderConfig config);
  void reset();
  FrameDecodeResult push(protocol::Bytes bytes);
  std::size_t bufferedBytes() const;

private:
  FrameDecodeResult pushLength(const protocol::Bytes& bytes);
  void discardPrefix(std::size_t count);

  FrameDecoderConfig config_;
  std::array<std::uint8_t, kMaxBufferedBytes> buffer_ {};
  std::size_t bufferedSize_ = 0;
  bool discardingOversizeFrame_ = false;
};
