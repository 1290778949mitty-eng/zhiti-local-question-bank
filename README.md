# Mitty 的宝藏题库

一个部署在 Cloudflare Workers 上的共享题库：访客可以直接浏览，受邀请会员登录后可以录题、组卷并下载 Word。

## 权限

- 访客：公开浏览题目和解析，不能录入、修改、删除、导入或下载。
- 普通会员：使用邮箱、密码和邀请码注册；可以录题、复制题目、下载题库，只能修改或删除自己录入的题目。
- 管理员：可以管理所有题目和分类。

所有写入、删除、导入和下载操作都会在 Worker API 中再次校验登录状态。前端隐藏按钮不是权限边界。

## 云端数据

- Cloudflare D1 保存用户、会话、分类、题目和图片分块。
- 密码使用 PBKDF2-SHA-256 加盐后保存，不保存明文。
- 登录使用 `HttpOnly`、`Secure`、`SameSite=Lax` Cookie。
- `ADMIN_EMAIL` 与 `REGISTRATION_INVITE_CODE` 必须通过 Wrangler Secret 配置，不能提交到 GitHub。

现有本地版导出的 JSON 备份可以在登录后通过“分类与数据管理 → 迁移本地备份”追加到云端。

## 本地开发

```bash
npm install
npx wrangler d1 migrations apply zhiti-question-bank --local
npm run dev
```

本地注册需要在未提交的 `.dev.vars` 中配置：

```text
ADMIN_EMAIL=管理员邮箱
REGISTRATION_INVITE_CODE=邀请码
```

## 部署

```bash
npx wrangler d1 migrations apply zhiti-question-bank --remote
npm run deploy
```

线上地址：<https://tiku.mittysapce.uk>

## 智能录题

截图识别、文件批量识别、AI 优化和矢量重绘接口仅允许登录用户调用。相关 OpenAI/Sub2API 配置使用 Worker Secret；未配置时仍可使用人工录题、共享浏览和 Word 组卷。

## Word 组卷

登录后勾选题目，点击底部“生成 Word”，可设置标题，并选择是否在文末附带答案与解析。文档为标准 `.docx` 格式。
