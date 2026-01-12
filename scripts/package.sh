#!/bin/bash
# 统一的扩展打包脚本（WXT）
# 用法: ./scripts/package.sh --browser <chrome|firefox|edge> --output <output-filename>
# 示例: ./scripts/package.sh --browser firefox --output Sapling-1.0.0-firefox.zip

set -euo pipefail

usage() {
  cat <<'EOF'
用法:
  ./scripts/package.sh --browser <chrome|firefox|edge> --output <output-filename>

参数:
  --browser   目标浏览器（例如：chrome / firefox / edge）
  --output    输出 zip 文件名（将写入 release/）
EOF
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BROWSER=""
OUTPUT_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --browser)
      BROWSER="${2:-}"
      shift 2
      ;;
    --output)
      OUTPUT_NAME="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "错误：未知参数 $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$BROWSER" || -z "$OUTPUT_NAME" ]]; then
  echo "错误：必须同时提供 --browser 与 --output" >&2
  usage >&2
  exit 2
fi

mkdir -p release

echo "正在使用 WXT 打包：browser=$BROWSER"

WXT_CMD=()
if [[ -x "./node_modules/.bin/wxt" ]]; then
  WXT_CMD=(./node_modules/.bin/wxt)
elif command -v wxt >/dev/null 2>&1; then
  WXT_CMD=(wxt)
elif command -v npm >/dev/null 2>&1; then
  WXT_CMD=(npm exec -- wxt)
else
  WXT_CMD=(npx --yes wxt)
fi

"${WXT_CMD[@]}" zip -b "$BROWSER"

ZIP_PATH="$(ls -1t .output/*-"$BROWSER".zip 2>/dev/null | head -n 1 || true)"
if [[ -z "$ZIP_PATH" || ! -f "$ZIP_PATH" ]]; then
  echo "错误：未找到 WXT 产物：.output/*-${BROWSER}.zip" >&2
  exit 1
fi

cp -f "$ZIP_PATH" "release/${OUTPUT_NAME}"

echo "✓ 打包完成: release/${OUTPUT_NAME}"
