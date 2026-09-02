# Node.js Task Runtime 架构设计说明

## 1. 架构总览

```text
                         Node.js Application
                                  │
                                  ▼
                       ┌────────────────────┐
                       │    Task Runtime     │
                       └─────────┬──────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
           Task API          Resource           Lifecycle
                              Manager
              │
              ▼
         Task Registry
              │
              ▼
         Task Scheduler
              │
              ▼
         Priority Queue
              │
              ▼
       Execution Manager
              │
      ┌───────┼────────┐
      ▼       ▼        ▼
   Thread   Process    CLI
  Executor  Executor  Executor
      │       │        │
      ▼       ▼        ▼
   Workers  Processes  Programs
```

## 2. 核心模块与目录结构

```text
src/
├── api/                  # 开发者面向的公开 API 封装
│   ├── runtime.ts        # createRuntime 入口
│   ├── task.ts           # task() 装饰与调用函数
│   └── cli.ts            # cli() 任务定义与调用函数
│
├── core/                 # 核心概念与生命周期
│   ├── runtime.ts        # Runtime 主类
│   ├── task.ts           # Task 实例与元数据
│   ├── execution.ts      # 单次 Execution 控制块
│   ├── executor.ts       # Executor 抽象接口
│   └── lifecycle.ts      # 运行生命周期管理 (Created -> Running -> Draining -> Stopped)
│
├── scheduler/            # 调度器与队列
│   ├── scheduler.ts      # 调度器实现
│   ├── queue.ts          # 基础队列接口
│   ├── priority-queue.ts # 优先级队列（堆/有序链表）
│   └── concurrency.ts    # 并发令牌管理
│
├── executors/            # 执行器实现
│   ├── thread/           # Worker Threads 执行器
│   │   ├── executor.ts
│   │   ├── pool.ts
│   │   └── worker-runtime.ts
│   ├── process/          # Child Process 执行器
│   │   ├── executor.ts
│   │   ├── pool.ts
│   │   └── manager.ts
│   └── cli/              # 外部 CLI 执行器
│       ├── executor.ts
│       ├── process.ts
│       └── protocol.ts
│
├── resource/             # 资源评估与限制
│   ├── cpu.ts            # CPU 核心数与自适应 worker 策略
│   ├── memory.ts         # 内存限制参数转换
│   └── limits.ts         # 资源限制配置定义
│
├── execution/            # 执行控制组件
│   ├── timeout.ts        # 超时终止处理
│   ├── retry.ts          # 重试与退避算法
│   ├── cancellation.ts   # AbortSignal 取消管理
│   └── error.ts          # 统一 RuntimeError 错误类
│
├── transport/            # 数据序列化与通信传输协议
│   ├── json.ts           # JSON 传输
│   ├── binary.ts         # Buffer / Binary 传输
│   └── protocol.ts       # IPC / stdio 协议包头
│
├── observability/        # 可观测性
│   ├── events.ts         # 事件派发中心
│   ├── metrics.ts        # 运行时统计与 metrics.stats()
│   └── logger.ts         # Logger 适配器接口
│
└── index.ts              # 统一导出入口
```

## 3. 核心概念与交互时序

1. **Task**: 逻辑任务定义，包含处理器引用（JS 函数或 CLI 路径）及默认执行选项（concurrency, priority, timeout, retry, resource）。
2. **Execution**: 单次 Task 调用的执行实体，生成唯一 Task ID 和 Execution ID。
3. **Scheduler**: 接收 Execution，进入优先级队列，根据全局及 Task 级并发约束出队。
4. **Executor**: 实际承载任务的执行器（ThreadExecutor / ProcessExecutor / CLIExecutor）。
5. **Lifecycle**: 负责资源安全退出、Worker / Process 清理，防止僵尸进程。
