#pragma once

#include "ProtocolUtils.h"

#include <array>
#include <cstddef>
#include <vector>

enum class FrameMode { Raw, Delimiter, Fixed };

struct FrameDecoderConfig {
  FrameMode mode = FrameMode::Raw;
  protocol::Bytes delimiter;
  std::size_t frameSize = 0;
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
  FrameDecoderConfig config_;
  std::array<std::uint8_t, kMaxBufferedBytes> buffer_ {};
  std::size_t bufferedSize_ = 0;
  bool discardingOversizeFrame_ = false;
};
