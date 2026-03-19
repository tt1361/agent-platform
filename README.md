# 智能体平台

一个本地可运行的智能体平台 MVP，包含：

- `Express + TypeScript` 后端
- `React + Vite + Ant Design` 前端控制台
- `MySQL + Prisma` 数据持久化
- `MiniMax` 模型接入
- 会话上下文、短期记忆、长期记忆、Trace 可视化

## 一、快速启动

1. 复制环境变量模板：

```bash
cp .env.example .env
cp .env.example server/.env
```

2. 根据本地环境修改 `.env` 和 `server/.env`，至少确保：

- `DATABASE_URL`
- `MINIMAX_API_KEY`
- `MINIMAX_BASE_URL`
- `MINIMAX_MODEL`

3. 安装依赖：

```bash
npm install
```

4. 初始化数据库结构：

```bash
npm run db:push --workspace server
```

5. 初始化默认 Provider 和示例 Skill：

```bash
npm run db:seed --workspace server
```

6. 启动前后端：

```bash
npm run dev
```

## 二、访问地址

- API：`http://localhost:3000`
- Web：`http://localhost:5173`

如果 `5173` 被占用，Vite 会自动切换到其他端口，请以终端输出为准。

## 三、推荐演示路径

### 1. 初始化数据

先确保数据库已推送和种子数据已写入：

```bash
npm run db:push --workspace server
npm run db:seed --workspace server
```

### 2. 打开工作台

进入 `工作台` 页面，确认：

- 可以看到默认 MiniMax Provider
- 可以看到示例 Skill
- 可以创建新会话

### 3. 建议先新建一个智能体

进入 `智能体管理` 页面，新建一个智能体。建议：

- 状态设为 `active`
- 绑定至少 1~2 个默认 Skill
- 使用默认 MiniMax Provider

说明：历史遗留的测试智能体可能未绑定技能，建议以新建智能体作为演示对象。

### 4. 体验会话上下文

回到 `工作台`：

- 选择刚创建的智能体
- 新建一个会话
- 连续发送两到三轮问题
- 验证智能体是否延续上下文回答

### 5. 查看记忆能力

在工作台右侧检查：

- `短期记忆`
- `长期记忆`
- `本轮记忆更新`

可继续体验：

- 长期记忆置顶
- 长期记忆删除
- 按类型筛选长期记忆

### 6. 查看执行与 Trace

- 在聊天消息中点击 `查看 Trace`
- 或进入 `执行记录` 页面查看分组后的 Trace 详情

## 四、当前能力范围

### 已支持

- Agent 创建、状态切换、删除
- Skill 创建、状态切换、删除
- Provider 列表与连通测试
- 会话上下文
- 短期记忆与长期记忆
- 长期记忆置顶与删除
- Execution / Trace 可视化
- 工作台、管理页、执行记录页

### 暂未纳入首版重点

- Redis / 队列
- 异步任务调度
- 向量检索型记忆召回
- 多租户权限体系
- 企业级认证

## 五、常用命令

```bash
# 启动前后端
npm run dev

# 单独启动后端
npm run dev:server

# 单独启动前端
npm run dev:web

# 推送数据库结构
npm run db:push --workspace server

# 重新生成 Prisma Client
npm run db:generate --workspace server

# 写入默认种子数据
npm run db:seed --workspace server

# 构建后端
npm run build --workspace server

# 构建前端
npm run build --workspace web
```

## 六、已知限制

- 当前长期记忆使用规则提取，不是向量检索召回
- 当前 MiniMax 解析已做兼容，但不同返回格式仍可能需要继续调优
- 前端构建仍有 `circular chunk` 提示，属于 Ant Design 拆包后的已知 warning，不影响运行
- 若数据库为空或技能被删除，请重新执行：

```bash
npm run db:seed --workspace server
```

## 七、排查建议

### 1. 无法看到技能

执行：

```bash
npm run db:seed --workspace server
```

### 2. 无法连接数据库

检查：

- `DATABASE_URL`
- MySQL 是否启动
- 用户是否有建表权限

### 3. Provider 测试失败

检查：

- `MINIMAX_API_KEY`
- `MINIMAX_BASE_URL`
- `MINIMAX_CHAT_PATH`
- 外网访问能力

## 八、建议的下一步

- 收尾自测与缺陷清单整理
- 继续增强记忆治理与召回逻辑
- 增加 Agent/Skill 详情与编辑能力
- 如进入生产化阶段，再继续做权限、异步执行、向量检索和部署优化
