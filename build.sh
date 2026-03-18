#!/bin/bash
# ============================================
# Ask Twice — 插件打包脚本
# 用法: ./build.sh [版本号]
# 示例: ./build.sh 0.2.0
# ============================================

set -e

# 读取版本号（优先命令行参数，否则从 manifest.json 读取）
if [ -n "$1" ]; then
  VERSION="$1"
  # 更新 manifest.json 中的版本号
  sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" extension/manifest.json
  echo "📝 版本号已更新为: $VERSION"
else
  VERSION=$(grep '"version"' extension/manifest.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
  echo "📦 使用当前版本号: $VERSION"
fi

OUTPUT_DIR="dist"
ZIP_NAME="asktwice-v${VERSION}.zip"

# 创建输出目录
mkdir -p "$OUTPUT_DIR"

# 清理旧包
rm -f "$OUTPUT_DIR/$ZIP_NAME"

# 打包（排除无关文件）
cd extension
zip -r "../$OUTPUT_DIR/$ZIP_NAME" . \
  -x ".*" \
  -x "__MACOSX/*" \
  -x "*.DS_Store"
cd ..

# 输出信息
SIZE=$(ls -lh "$OUTPUT_DIR/$ZIP_NAME" | awk '{print $5}')
echo ""
echo "✅ 打包完成!"
echo "   文件: $OUTPUT_DIR/$ZIP_NAME"
echo "   大小: $SIZE"
echo "   版本: $VERSION"
echo ""
echo "📤 上传到 Chrome Web Store:"
echo "   https://chrome.google.com/webstore/devconsole"
