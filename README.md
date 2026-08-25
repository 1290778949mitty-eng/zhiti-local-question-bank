# Mitty 的宝藏题库

一个部署在 Cloudflare Workers 上的双入口题库：公共资源库用于发布只读共享资源；“我的题库”按账户完全隔离，供受邀请会员维护自己的模块、分类和题目。

## 题库与模块

- 公共资源库：访客可浏览题干、答案和解析；登录会员可在公共库内勾题导出 Word，并把题目复制成不受原题后续变化影响的私人副本。
- 我的题库：新账户从空库开始，可新建模块、分类和题目。私人题目及图片只允许所属账户读取。
- 两个入口使用同一网址和账号，但拥有彼此独立的组卷篮，不能把公共题与私人题混在同一份 Word 中。

模块由 D1 数据驱动，可新建、改名、修改副标题、拖动或用按钮排序。删除非空模块时会显示分类/题目计数，并要求输入完整模块名确认。导出标题默认使用“模块名 + 专项练习”。

迁移后公共库以“深圳中考 / 深圳自主招生考试 / 深国交入学考”及原副标题、顺序作为初始状态；它们不是页面中的固定模块，管理员可按普通模块继续编辑。

## 权限

- 访客：浏览公共题目、答案和解析，不能进入私人库、勾题、复制或下载。
- 普通会员：使用邮箱、密码和邀请码注册；只管理自己的私人库，可从公共库复制题目并分别从公共/私人库组卷。
- 线上管理员：账户权限仍受题库作用域限制，不能直接改公共库。
- localhost 本地管理员：免登录维护公共编辑库，并通过“发布公共资源库”完整镜像到线上。

所有写入、删除、导入和下载操作都会在 Worker API 中再次校验登录状态。前端隐藏按钮不是权限边界。

## 云端数据

- Cloudflare D1 保存用户、会话、题库、动态模块、分类、题目、发布版本、图片分块及图片访问关联。
- 密码使用 PBKDF2-SHA-256 加盐后保存，不保存明文。
- 登录使用 `HttpOnly`、`Secure`、`SameSite=Lax` Cookie。
- `ADMIN_EMAIL` 与 `REGISTRATION_INVITE_CODE` 必须通过 Wrangler Secret 配置，不能提交到 GitHub。

备份 JSON 包含 `scope`、模块、分类和题目。会员只能导入、导出自己的私人库；localhost 管理员备份公共编辑库。旧版顶级分类备份仍可导入，导入器会沿完整祖先链恢复其模块。

## 本地开发

```bash
npm install
npx wrangler d1 migrations apply zhiti-question-bank --local
npm run dev
```

本地注册和发布需要在未提交的 `.env.local` 或 `.dev.vars` 中配置：

```text
ADMIN_EMAIL=管理员邮箱
REGISTRATION_INVITE_CODE=邀请码
PUBLIC_LIBRARY_REMOTE_URL=https://tiku.mittysapce.uk
PUBLIC_LIBRARY_PUBLISH_TOKEN=至少32字节的随机密钥
```

AI 地址、Key 和模型名继续保存在未提交的 `.env.local`。`npm run dev` 会把两份本地配置安全合并到 Worker 使用的 `.dev.vars`，并仅为本地开发注入 `LOCAL_ADMIN_MODE=true`。绝对不要把 `LOCAL_ADMIN_MODE` 配置为线上 Secret。

一键发布先比对内容哈希，只上传变化实体和远端缺失图片；远端在暂存版本完成校验后原子切换。删除也属于完整镜像的一部分，任何失败都会继续展示上一公共版本。相同内容的图片按哈希复用。

## 部署

```bash
npm run db:audit:scoped:remote
npx wrangler d1 migrations apply zhiti-question-bank --remote
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put REGISTRATION_INVITE_CODE
npx wrangler secret put PUBLIC_LIBRARY_PUBLISH_TOKEN
npm run deploy
```

正式迁移前必须先取得 Cloudflare API Token、导出远程 D1 备份并运行远程计数审计。首次发布功能测试应使用两套隔离的本地 D1，不使用生产库。

线上地址：<https://tiku.mittysapce.uk>

## 智能录题

截图识别、文件批量识别、AI 优化和矢量重绘接口仅允许登录用户调用。相关 OpenAI/Sub2API 配置使用 Worker Secret；未配置时仍可使用人工录题、共享浏览和 Word 组卷。

## Word 组卷

登录后在当前题库勾选题目，点击底部“生成 Word”，可设置标题，并选择是否在文末附带答案与解析。服务端会再次验证题库作用域与每个题目 ID；文档为标准 `.docx` 格式。

## 验证

```bash
npm test
npm run lint
npm run db:audit:scoped
```

`npm test` 包含一项真实的双 Worker / 双 D1 集成测试，覆盖账户隔离、访客权限、模块排序与级联删除、私人图片、下载作用域、公共题独立复制、发布密钥、增量发布、失败回滚和完整镜像删除。
