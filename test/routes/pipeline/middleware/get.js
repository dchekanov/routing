export default {
  middleware: (req, res, next) => {
    next(new Error('MIDDLEWARE'));
  },
  handle: (req, res) => res.end('ok')
};
