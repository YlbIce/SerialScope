#include "FrameDecoder.h"

#include <algorithm>
#include <cstdint>
#include <iterator>
#include <utility>

namespace {

std::uint32_t readLength(const std::uint8_t* data, std::size_t size, LengthEndian endian) {
  std::uint32_t value = 0;
  if (endian == LengthEndian::Little) {
    for (std::size_t i = 0; i < size; ++i) {
      value |= static_cast<std::uint32_t>(data[i]) << (8u * i);
    }
  } else {
    for (std::size_t i = 0; i < size; ++i) {
      value = (value << 8) | data[i];
    }
  }
  return value;
}

} // namespace

void FrameDecoder::configure(FrameDecoderConfig config) {
  config.maxBufferedBytes = std::min(config.maxBufferedBytes, kMaxBufferedBytes);
  config_ = std::move(config);
  reset();
}

void FrameDecoder::reset() {
  bufferedSize_ = 0;
  discardingOversizeFrame_ = false;
}

std::size_t FrameDecoder::bufferedBytes() const {
  return bufferedSize_;
}

FrameDecodeResult FrameDecoder::push(protocol::Bytes bytes) {
  FrameDecodeResult result;
  if (config_.mode == FrameMode::Raw) {
    if (!bytes.empty()) {
      result.frames.push_back(std::move(bytes));
    }
    return result;
  }

  if (config_.mode == FrameMode::Fixed) {
    if (config_.frameSize == 0 || config_.frameSize > kMaxFixedFrameBytes) {
      result.overflowed = true;
      return result;
    }
    std::size_t offset = 0;
    while (offset < bytes.size()) {
      const std::size_t count = std::min(config_.frameSize - bufferedSize_, bytes.size() - offset);
      std::copy_n(bytes.begin() + static_cast<std::ptrdiff_t>(offset), count, buffer_.begin() + static_cast<std::ptrdiff_t>(bufferedSize_));
      offset += count;
      bufferedSize_ += count;
      if (bufferedSize_ == config_.frameSize) {
        result.frames.emplace_back(buffer_.begin(), buffer_.begin() + static_cast<std::ptrdiff_t>(bufferedSize_));
        bufferedSize_ = 0;
      }
    }
    return result;
  }

  if (config_.mode == FrameMode::Length) {
    return pushLength(bytes);
  }

  std::size_t offset = 0;
  while (offset < bytes.size()) {
    if (discardingOversizeFrame_) {
      const auto delimiter = std::search(
        bytes.begin() + static_cast<std::ptrdiff_t>(offset), bytes.end(),
        config_.delimiter.begin(), config_.delimiter.end()
      );
      if (delimiter == bytes.end()) {
        break;
      }
      offset = static_cast<std::size_t>(std::distance(bytes.begin(), delimiter)) + config_.delimiter.size();
      discardingOversizeFrame_ = false;
      continue;
    }

    const std::size_t available = config_.maxBufferedBytes - bufferedSize_;
    const std::size_t count = std::min(available, bytes.size() - offset);
    std::copy_n(bytes.begin() + static_cast<std::ptrdiff_t>(offset), count, buffer_.begin() + static_cast<std::ptrdiff_t>(bufferedSize_));
    offset += count;
    bufferedSize_ += count;

    while (bufferedSize_ > 0) {
      const auto begin = buffer_.begin();
      const auto end = begin + static_cast<std::ptrdiff_t>(bufferedSize_);
      const auto delimiter = std::search(begin, end, config_.delimiter.begin(), config_.delimiter.end());
      if (delimiter == end) {
        break;
      }
      const auto frameEnd = delimiter + static_cast<std::ptrdiff_t>(config_.delimiter.size());
      result.frames.emplace_back(begin, frameEnd);
      const auto remaining = static_cast<std::size_t>(std::distance(frameEnd, end));
      std::move(frameEnd, end, buffer_.begin());
      bufferedSize_ = remaining;
    }

    if (bufferedSize_ >= config_.maxBufferedBytes) {
      bufferedSize_ = 0;
      discardingOversizeFrame_ = true;
      result.overflowed = true;
    }
  }
  return result;
}

void FrameDecoder::discardPrefix(std::size_t count) {
  if (count >= bufferedSize_) {
    bufferedSize_ = 0;
    return;
  }
  const auto begin = buffer_.begin();
  const auto end = begin + static_cast<std::ptrdiff_t>(bufferedSize_);
  std::move(begin + static_cast<std::ptrdiff_t>(count), end, begin);
  bufferedSize_ -= count;
}

FrameDecodeResult FrameDecoder::pushLength(const protocol::Bytes& bytes) {
  FrameDecodeResult result;

  if (config_.header.empty() ||
      (config_.lengthFieldSize != 1 && config_.lengthFieldSize != 2 && config_.lengthFieldSize != 4) ||
      config_.maxFrameSize == 0) {
    result.overflowed = true;
    return result;
  }

  // 追加新字节到缓冲（受上限保护）。
  const std::size_t space = config_.maxBufferedBytes - bufferedSize_;
  const std::size_t count = std::min(space, bytes.size());
  std::copy_n(bytes.begin(), count, buffer_.begin() + static_cast<std::ptrdiff_t>(bufferedSize_));
  bufferedSize_ += count;
  if (count < bytes.size()) {
    result.overflowed = true;
  }

  const auto bufferBegin = buffer_.begin();
  while (bufferedSize_ > 0) {
    const auto bufferEnd = bufferBegin + static_cast<std::ptrdiff_t>(bufferedSize_);

    // 1. 定位帧头。
    const auto headerIt = std::search(bufferBegin, bufferEnd,
                                      config_.header.begin(), config_.header.end());
    if (headerIt == bufferEnd) {
      // 无完整帧头；若已到缓冲上限则丢弃全部（避免无界增长）。
      if (bufferedSize_ >= config_.maxBufferedBytes) {
        bufferedSize_ = 0;
        result.overflowed = true;
      }
      break;
    }
    const std::size_t frameStart = static_cast<std::size_t>(std::distance(bufferBegin, headerIt));

    // 2. 长度域是否已齐。
    const std::size_t lengthEnd = frameStart + config_.lengthFieldOffset + config_.lengthFieldSize;
    if (lengthEnd > bufferedSize_) {
      // 帧头前的噪声在到达上限时丢弃，保留候选帧头。
      if (bufferedSize_ >= config_.maxBufferedBytes && frameStart > 0) {
        discardPrefix(frameStart);
        result.overflowed = true;
      }
      break;
    }

    // 3. 读取长度值并计算帧总长。
    const std::uint32_t lengthValue =
        readLength(buffer_.data() + frameStart + config_.lengthFieldOffset,
                   config_.lengthFieldSize, config_.lengthEndian);
    std::size_t totalLength = config_.lengthIncludesHeader
        ? static_cast<std::size_t>(lengthValue)
        : (config_.lengthFieldOffset + config_.lengthFieldSize + static_cast<std::size_t>(lengthValue));

    // 4. 校验帧长范围。
    const bool tooSmall = config_.minFrameSize > 0 && totalLength < config_.minFrameSize;
    const bool tooLarge = config_.maxFrameSize > 0 && totalLength > config_.maxFrameSize;
    if (tooSmall || tooLarge || totalLength > config_.maxBufferedBytes) {
      result.overflowed = true;
      // 丢弃当前候选帧头（含 frameStart 处 header），继续搜索下一个帧头。
      discardPrefix(frameStart + config_.header.size());
      continue;
    }

    // 5. 帧数据是否已齐。
    if (frameStart + totalLength > bufferedSize_) {
      if (bufferedSize_ >= config_.maxBufferedBytes && frameStart > 0) {
        discardPrefix(frameStart);
        result.overflowed = true;
      }
      break;
    }

    // 6. 输出完整帧并移除。
    result.frames.emplace_back(bufferBegin + static_cast<std::ptrdiff_t>(frameStart),
                               bufferBegin + static_cast<std::ptrdiff_t>(frameStart + totalLength));
    discardPrefix(frameStart + totalLength);
  }

  return result;
}
