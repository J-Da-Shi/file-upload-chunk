## 项目架构
使用monorepo进行包管理

packages内为子项目
包含node接口与ui展示

## 启动
- 启动react项目：pnpm dev:file
- 启动server项目：pnpm dev:server

## 目前支持情况
暂时只支持上传分片，上传完成后合并。
断点续传 -> 开发中

## .npmrc 作用
作用：让 pnpm 自动提升常用 devDependencies 到根 node_modules，避免每个子项目重复安装。