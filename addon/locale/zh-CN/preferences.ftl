pref-title = Zota

# API Settings
pref-max-tokens = 最大Token数
pref-max-tokens-hint = -1 表示不限制模型回复 token 数
pref-temperature = 温度
pref-pdf-max-chars = PDF字符上限
pref-pdf-max-chars-hint = -1 完整上传，⚠️ 增加延迟和费用
pref-system-prompt = 系统提示词
pref-system-prompt-placeholder =
    .placeholder = 可选：自定义 AI 指令。注意：Markdown 格式要求（数学公式等）已内置。
pref-streaming-output = 流式输出
pref-streaming-output-hint = 开启后实时显示 AI 响应

# Provider Settings
pref-builtin-providers = 内置提供商
pref-custom-providers = 自定义提供商

# Provider Configuration
pref-api-key = API 密钥
pref-base-url = 接口地址
pref-visit-website = 官网
pref-show-key = 显示
pref-hide-key = 隐藏
pref-refresh-models = 刷新
pref-test-connection = 测试连接
pref-delete-provider = 删除

# Active Provider
pref-active-provider = 当前提供商

# Test Results
pref-testing = 测试中...
pref-test-success = 连接成功！
pref-test-failed = 连接失败
pref-provider-not-ready = 提供商未配置
pref-fetching-models = 正在获取模型列表...
pref-models-loaded = 已加载 { $count } 个模型
pref-fetch-models-failed = 获取模型列表失败

# Custom Provider
pref-enter-provider-name = 请输入提供商名称:
pref-provider-added = 提供商已添加，请配置 API 密钥

# Model Management
pref-model = 模型
pref-model-list = 模型列表
pref-add-model = + 添加模型
pref-enter-model-id = 请输入模型ID:
pref-model-custom = 自定义
pref-model-exists = 该模型已存在

# Endpoint Management
pref-add-endpoint = + 新增接口地址
pref-edit-endpoint = 修改接口地址
pref-delete-endpoint = 删除接口地址
pref-enter-base-url = 请输入接口地址:
pref-edit-base-url = 修改接口地址:
pref-endpoint-exists = 该接口地址已存在
pref-endpoint-added = 接口地址已添加
pref-endpoint-edited = 接口地址已修改
pref-endpoint-deleted = 接口地址已删除
pref-delete-endpoint-confirm = 确定要删除接口地址 "{ $endpoint }" 吗？
pref-cannot-add-endpoint-builtin = 无法为内置提供商添加接口地址
pref-cannot-edit-endpoint-builtin = 无法修改内置提供商的接口地址
pref-cannot-delete-endpoint-builtin = 无法删除内置提供商的接口地址
pref-add-endpoint-first = 请先添加接口地址

# API Key Management
pref-add-apikey = + 新增 API 密钥
pref-edit-apikey = 修改 API 密钥
pref-delete-apikey = 删除 API 密钥
pref-enter-apikey = 请输入 API 密钥:
pref-enter-apikey-name = API 密钥名称（可选）:
pref-edit-apikey-name = 修改 API 密钥名称（可选）:
pref-apikey-exists = 该 API 密钥已存在
pref-delete-apikey-confirm = 确定要删除 API 密钥 "{ $key }" 吗？
pref-apikey-deleted = API 密钥已删除
pref-apikey-edited = API 密钥已修改

# Delete Provider
pref-cannot-delete-builtin = 无法删除内置提供商
pref-delete-provider-confirm = 确定要删除提供商 "{ $name }" 吗？

# Add Custom Provider Types
pref-add-openai-endpoint = + 新增 OpenAI 兼容端点
pref-openai-compatible = OpenAI 兼容端点
pref-anthropic-compatible = Anthropic 兼容端点
