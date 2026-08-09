#include "FrameDecoder.h"

#include <algorithm>
#include <iterator>
#include <utility>

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
