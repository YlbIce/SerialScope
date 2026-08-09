#include "FrameDecoder.h"

#include <cstdlib>
#include <iostream>
#include <memory>
#include <string>

namespace {

void require(bool condition, const std::string& message) {
  if (!condition) {
    std::cerr << "FAILED: " << message << '\n';
    std::exit(1);
  }
}

FrameDecoderConfig delimiterConfig() {
  FrameDecoderConfig config;
  config.mode = FrameMode::Delimiter;
  config.delimiter = {'\n'};
  return config;
}

} // namespace

int main() {
  auto decoder = std::make_unique<FrameDecoder>();
  decoder->configure(delimiterConfig());

  auto merged = decoder->push({'A', '\n', 'B', '\n'});
  require(!merged.overflowed && merged.frames.size() == 2, "粘连 LF 帧必须拆为两帧");
  require(merged.frames[0] == protocol::Bytes({'A', '\n'}), "第一帧内容错误");
  require(merged.frames[1] == protocol::Bytes({'B', '\n'}), "第二帧内容错误");

  auto partial = decoder->push({'C'});
  require(!partial.overflowed && partial.frames.empty(), "不完整帧不得提前发出");
  auto completed = decoder->push({'\n'});
  require(completed.frames.size() == 1 && completed.frames[0] == protocol::Bytes({'C', '\n'}), "跨读取帧内容错误");

  const std::size_t limit = delimiterConfig().maxBufferedBytes;
  decoder->configure(delimiterConfig());
  auto belowLimit = decoder->push(protocol::Bytes(limit - 1, 'A'));
  require(!belowLimit.overflowed, "小于上限的未完成帧不得溢出");
  require(decoder->bufferedBytes() == limit - 1, "缓冲大小必须保持在上限内");
  auto atLimit = decoder->push({'B'});
  require(atLimit.overflowed && atLimit.frames.empty(), "恰好达到上限且无分隔符必须溢出");
  require(decoder->bufferedBytes() == 0, "溢出后缓冲必须清空");
  auto discardedTerminator = decoder->push({'\n'});
  require(discardedTerminator.frames.empty(), "溢出帧的结束符必须一并丢弃");
  auto recoveredAfterLimit = decoder->push({'C', '\n'});
  require(recoveredAfterLimit.frames.size() == 1 && recoveredAfterLimit.frames[0] == protocol::Bytes({'C', '\n'}), "达到上限后必须恢复接收");

  decoder->configure(delimiterConfig());
  decoder->push(protocol::Bytes(limit - 1, 'A'));
  auto delimiterAfterLimit = decoder->push({'B', '\n'});
  require(delimiterAfterLimit.overflowed && delimiterAfterLimit.frames.empty(), "超过上限的完整帧必须丢弃");
  require(decoder->bufferedBytes() == 0, "超限完整帧不得保留缓冲");
  auto recoveredAfterOversize = decoder->push({'D', '\n'});
  require(recoveredAfterOversize.frames.size() == 1 && recoveredAfterOversize.frames[0] == protocol::Bytes({'D', '\n'}), "超限完整帧后必须恢复接收");

  auto raw = std::make_unique<FrameDecoder>();
  auto rawFrame = raw->push({'R', 'A', 'W'});
  require(rawFrame.frames.size() == 1 && rawFrame.frames[0] == protocol::Bytes({'R', 'A', 'W'}), "raw 模式必须保留读取块");

  FrameDecoderConfig fixedConfig;
  fixedConfig.mode = FrameMode::Fixed;
  fixedConfig.frameSize = 4;
  auto fixed = std::make_unique<FrameDecoder>();
  fixed->configure(fixedConfig);
  auto fixedFirst = fixed->push({0x01, 0x02, 0x03, 0x04, 0x05, 0x06});
  require(fixedFirst.frames.size() == 1 && fixedFirst.frames[0] == protocol::Bytes({0x01, 0x02, 0x03, 0x04}), "fixed 模式首帧错误");
  auto fixedSecond = fixed->push({0x07, 0x08});
  require(fixedSecond.frames.size() == 1 && fixedSecond.frames[0] == protocol::Bytes({0x05, 0x06, 0x07, 0x08}), "fixed 模式跨读取帧错误");

  FrameDecoderConfig invalidFixedConfig;
  invalidFixedConfig.mode = FrameMode::Fixed;
  invalidFixedConfig.frameSize = 0;
  auto invalidFixed = std::make_unique<FrameDecoder>();
  invalidFixed->configure(invalidFixedConfig);
  const auto invalidFixedResult = invalidFixed->push({0x01});
  require(invalidFixedResult.overflowed && invalidFixedResult.frames.empty(), "fixed=0 必须防御性拒绝且不得死循环");

  FrameDecoderConfig maximumFixedConfig;
  maximumFixedConfig.mode = FrameMode::Fixed;
  maximumFixedConfig.frameSize = FrameDecoder::kMaxFixedFrameBytes;
  auto maximumFixed = std::make_unique<FrameDecoder>();
  maximumFixed->configure(maximumFixedConfig);
  const auto maximumFixedResult = maximumFixed->push(protocol::Bytes(FrameDecoder::kMaxFixedFrameBytes, 0xFF));
  require(maximumFixedResult.frames.size() == 1 && maximumFixedResult.frames[0].size() == FrameDecoder::kMaxFixedFrameBytes, "最大 fixed 帧必须完整发出");

  // ---- Length 模式：完整帧 ----
  {
    FrameDecoderConfig config;
    config.mode = FrameMode::Length;
    config.header = {0xAA, 0x55};
    config.lengthFieldOffset = 2;
    config.lengthFieldSize = 1;
    config.lengthIncludesHeader = false;
    config.lengthEndian = LengthEndian::Little;
    config.maxFrameSize = 64;
    auto decoder = std::make_unique<FrameDecoder>();
    decoder->configure(config);
    auto result = decoder->push({0xAA, 0x55, 0x02, 0x11, 0x22});
    require(!result.overflowed && result.frames.size() == 1, "Length 完整帧应输出一帧");
    require(result.frames[0] == protocol::Bytes({0xAA, 0x55, 0x02, 0x11, 0x22}), "Length 完整帧内容错误");
  }

  // ---- Length 模式：粘包多帧 ----
  {
    FrameDecoderConfig config;
    config.mode = FrameMode::Length;
    config.header = {0xAA, 0x55};
    config.lengthFieldOffset = 2;
    config.lengthFieldSize = 1;
    config.lengthIncludesHeader = false;
    config.lengthEndian = LengthEndian::Little;
    config.maxFrameSize = 64;
    auto decoder = std::make_unique<FrameDecoder>();
    decoder->configure(config);
    auto result = decoder->push({0xAA, 0x55, 0x02, 0x11, 0x22, 0xAA, 0x55, 0x01, 0xFF});
    require(!result.overflowed && result.frames.size() == 2, "Length 粘包应输出两帧");
    require(result.frames[0] == protocol::Bytes({0xAA, 0x55, 0x02, 0x11, 0x22}), "Length 粘包第一帧错误");
    require(result.frames[1] == protocol::Bytes({0xAA, 0x55, 0x01, 0xFF}), "Length 粘包第二帧错误");
  }

  // ---- Length 模式：半包跨 push ----
  {
    FrameDecoderConfig config;
    config.mode = FrameMode::Length;
    config.header = {0xAA, 0x55};
    config.lengthFieldOffset = 2;
    config.lengthFieldSize = 1;
    config.lengthIncludesHeader = false;
    config.lengthEndian = LengthEndian::Little;
    config.maxFrameSize = 64;
    auto decoder = std::make_unique<FrameDecoder>();
    decoder->configure(config);
    auto first = decoder->push({0xAA, 0x55, 0x02, 0x11});
    require(!first.overflowed && first.frames.empty(), "Length 半包首推不得输出帧");
    auto second = decoder->push({0x22});
    require(!second.overflowed && second.frames.size() == 1, "Length 半包补齐后应输出一帧");
    require(second.frames[0] == protocol::Bytes({0xAA, 0x55, 0x02, 0x11, 0x22}), "Length 半包帧内容错误");
  }

  // ---- Length 模式：includesHeader=true ----
  {
    FrameDecoderConfig config;
    config.mode = FrameMode::Length;
    config.header = {0xAA};
    config.lengthFieldOffset = 1;
    config.lengthFieldSize = 1;
    config.lengthIncludesHeader = true;
    config.lengthEndian = LengthEndian::Little;
    config.maxFrameSize = 64;
    auto decoder = std::make_unique<FrameDecoder>();
    decoder->configure(config);
    auto result = decoder->push({0xAA, 0x04, 0x01, 0x02});
    require(!result.overflowed && result.frames.size() == 1, "Length includesHeader 应输出一帧");
    require(result.frames[0] == protocol::Bytes({0xAA, 0x04, 0x01, 0x02}), "Length includesHeader 帧内容错误");
  }

  // ---- Length 模式：2 字节大端 ----
  {
    FrameDecoderConfig config;
    config.mode = FrameMode::Length;
    config.header = {0xAA};
    config.lengthFieldOffset = 1;
    config.lengthFieldSize = 2;
    config.lengthIncludesHeader = false;
    config.lengthEndian = LengthEndian::Big;
    config.maxFrameSize = 64;
    auto decoder = std::make_unique<FrameDecoder>();
    decoder->configure(config);
    auto result = decoder->push({0xAA, 0x00, 0x02, 0x01, 0x02});
    require(!result.overflowed && result.frames.size() == 1, "Length 大端应输出一帧");
    require(result.frames[0] == protocol::Bytes({0xAA, 0x00, 0x02, 0x01, 0x02}), "Length 大端帧内容错误");
  }

  // ---- Length 模式：超限帧丢弃后恢复 ----
  {
    FrameDecoderConfig config;
    config.mode = FrameMode::Length;
    config.header = {0xAA, 0x55};
    config.lengthFieldOffset = 2;
    config.lengthFieldSize = 1;
    config.lengthIncludesHeader = false;
    config.lengthEndian = LengthEndian::Little;
    config.maxFrameSize = 5;
    auto decoder = std::make_unique<FrameDecoder>();
    decoder->configure(config);
    auto result = decoder->push({0xAA, 0x55, 0x63, 0x01, 0xAA, 0x55, 0x02, 0x0A, 0x0B});
    require(result.overflowed, "Length 超限帧必须置 overflowed");
    require(result.frames.size() == 1, "Length 超限后应输出后续正常帧");
    require(result.frames[0] == protocol::Bytes({0xAA, 0x55, 0x02, 0x0A, 0x0B}), "Length 超限后恢复帧内容错误");
  }

  // ---- Length 模式：非法配置防御 ----
  {
    FrameDecoderConfig config;
    config.mode = FrameMode::Length;
    config.header = {};  // 空 header
    config.lengthFieldSize = 1;
    config.maxFrameSize = 64;
    auto decoder = std::make_unique<FrameDecoder>();
    decoder->configure(config);
    auto result = decoder->push({0x01, 0x02});
    require(result.overflowed && result.frames.empty(), "Length 空 header 必须防御性拒绝");
  }
  {
    FrameDecoderConfig config;
    config.mode = FrameMode::Length;
    config.header = {0xAA};
    config.lengthFieldSize = 3;  // 非法宽度
    config.maxFrameSize = 64;
    auto decoder = std::make_unique<FrameDecoder>();
    decoder->configure(config);
    auto result = decoder->push({0xAA, 0x01, 0x02});
    require(result.overflowed && result.frames.empty(), "Length 非法 lengthFieldSize 必须防御性拒绝");
  }

  std::cout << "FrameDecoder tests passed\n";
  return 0;
}
