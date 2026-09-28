/**
 * 包装 async Express 处理器，把 rejected promise 转给错误中间件
 * （Express 4 不会自动捕获 async 处理器抛出的异常）。
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express'

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}
