const pino = require('pino');

// Create logger configuration
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'production' ? undefined : {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname,env',
      singleLine: true,
      translateTime: 'HH:MM:ss',
      messageFormat: '\x1b[36m[{module}]\x1b[0m {msg}',
      hideObject: false,
      levelFirst: false
    }
  },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err
  },
  base: {
    env: process.env.NODE_ENV || 'development'
  }
});

// Create child loggers for different modules
const createLogger = (module) => {
  return logger.child({ module });
};

module.exports = { logger, createLogger };