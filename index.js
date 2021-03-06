'use strict';

let name = 'pʌʃ';

const pk = require('./package.json');
const crypto = require('crypto');
const program = require('commander');
const Document = require('nedb');
const path = require('path');
const mkdirp = require('mkdirp');
const debug = require('debug')(name);
require('colors');

let _ = {
  sha1 (msg) {
    return crypto.createHash('sha1').update(msg, 'utf8').digest('hex');
  },
  today () {
    return new Date().toJSON().slice(0, 10);
  },
  isStringEmpty (val) {
    return typeof val === 'undefined' || !val || val === '' || val.length <= 0;
  },
  stdout (docs) {
    let out = docs.reduce((stdout, doc) => {
      stdout += `${doc.sha1.slice(0, 7).yellow} ${doc.date} | ${doc.text}\n`;
      return stdout;
    }, '');
    process.stdout.write(out);
  },
  err (msg) {
    if (process.env.NODE_ENV === 'test') {
      debug('[err throw]', msg);
      return;
    }
    throw new Error(msg);
  }
};

class LocalStorage {
  constructor (opts) {
    opts = opts || {};
    this.isReady = opts.isReady || () => {}
    this.inMemory = opts.inMemory || false;
    debug('LocalStorage#constructor');
    this.dotpath = path.join(process.env.HOME, '.pus');
    this.mkdir();

    let suf = opts.env === 'test' ? '-test' : '';
    this.path = path.join(this.dotpath, `commits${suf}.db`);
  }

  connect() {
    this.docs = new Document({
      filename: this.path,
      inMemoryOnly: this.inMemory
    });
    this.docs.loadDatabase(this.isReady.bind(this));
  }

  mkdir () {
    debug('LocalStorage#mkdir');
    mkdirp.sync(this.dotpath);
  }

  insert (doc, cb) {
    debug('Storage#insert');
    this.docs.insert(doc, (err) => {
      if (err) {
        _.err(`Error while trying to insert. ${err.message}`);
      }
      cb();
    });
  }

  count (cb) {
    debug('Storage#count');
    this.docs.count({}, (err, count) => {
      if (err) {
        _.err(`Error while trying to count. ${err.message}`);
      }

      cb(count);
    });
  }

  find (query, opts, cb) {
    debug('Storage#find');
    let sortby = opts.sort || { date: -1 };
    let limit = opts.limit || 100;
    this.docs.find(query || {}).sort(sortby).limit(limit).exec((err, docs) => {
      if (err) {
        _.err(`Error while trying to find. ${err.message}`);
      }

      cb(docs);
    });
  }

  findOne (query, cb) {
    this.docs.findOne(query).exec((err, doc) => {
      if (err) {
        _.err(`Error while trying to findOne. ${err.message}`);
      }

      cb(doc);
    });
  }

  update (query, updates, cb) {
    this.docs.update(query, updates, (err) => {
      if (err) {
        _.err(`Error while trying to update. ${err.message}`);
      }

      cb();
    });
  }
}

class Validation {
  constructor (options) {
    this.cmd = options._name;

    this.cantdoc = `Can't execute '${this.cmd}' command.`;
    this.seedoc = `see doc by taping 'pus ${this.cmd} --help'`;
    this.options = options;

    this.fields = options.options.map((opt) => opt.long.slice(2));

    if (typeof this.options !== 'object') {
      _.err(`Options are not valid. ${this.seedoc}`);
    }

    this.isOK();
  }

  isOK () {
    return this.fields.every(this.validate.bind(this));
  }

  validate (field) {
    debug('Validation#validate', field);
    return this[field](this.options[field]);
  }

  task () { return true; }
  event () { return true; }
  note () { return true; }
  done () { return true; }
  collection () { return true; }

  limit (val) {
    debug('Validation#limit', val);
    if (val && isNaN(+val)) {
      _.err(`${this.cantdoc} Limit must be a number. ${this.seedoc}`);
    }

    return true;
  }

  date (val) {
    debug('Validation#date', val);
    if (val && (!/^\d{4}-\d{2}-\d{2}$/.test(val) || isNaN(Date.parse(val)))) {
      _.err(`${this.cantdoc} Date is incorrect. ${this.seedoc}`);
    }

    return true;
  }
}

class Command {
  constructor (storage, options) {
    Object.assign(this, options);

    this.storage = storage;
    this.defaults();

    this.validator = new Validation(options);
    this.validate();
  }

  defaults () {}
  validate () {}
  run () {}
}

class Done extends Command {
  validate () {
    debug('Done#validate', this.sha1);

    let validator = this.validator;
    if (_.isStringEmpty(this.sha1) || this.sha1.length < 7) {
      _.err(`${validator.cantdoc} ${validator.seedoc}`);
    }
  }

  query () {
    return {
      sha1: new RegExp(`^${this.sha1}`),
      flag: '.'
    };
  }

  run () {
    this.storage.findOne(this.query(), (doc) => {
      if (!doc) {
        process.stdout.write('Task not found!\n');
        return process.exit();
      }

      let updates = { $set: {
        flag: '~',
        text: '~ ' + doc.text.slice(2)
      } };
      this.storage.update({ _id: doc._id }, updates, () => {
        // use commit run to insert commit
        Commit.prototype.run.call({
          storage: this.storage,
          flag: 'x',
          text: doc.text.slice(2),
          date: this.date || _.today()
        }, doc.sha1);
      });
    });
  }
}

class Show extends Done {
  run () {
    let docs = [];
    let findOne = (sha1) => {
      this.storage.findOne({ sha1: new RegExp(`^${sha1}`) }, (doc) => {
        if (!doc) {
          return;
        }
        if (doc) {
          docs.push(doc);
        }
        if (!doc.parent) {
          return _.stdout(docs.sort((a, b) => {
            return b.at > a.at ? 1 : -1;
          }));
        }
        findOne(doc.parent);
      });
    };
    findOne(this.sha1);
  }
}

class Commit extends Command {
  defaults () {
    if (!this.limit) {
      this.limit = 59;
    }
    if (!this.date) {
      this.date = _.today();
    }
  }

  validate () {
    let validator = this.validator;

    if (_.isStringEmpty(this.text)) {
      _.err(`${validator.cantdoc} ${validator.seedoc}`);
    }

    if (this.text.length > +this.limit) {
      _.err(`Can't commit, you go over the limitation. ${validator.seedoc}`);
    }
  }

  run (parent, cb) {
    let flag = this.flag || (this.task ? '.' : (this.event ? 'o' : '-'));

    let doc = {
      date: this.date,
      text: [flag, this.text].join(' '),
      flag: flag
    };
    if (parent) {
      doc.parent = parent;
    }
    if (this.collection) {
      doc.collection = this.collection;
    }

    this.storage.count((count) => {
      doc.at = new Date().toJSON();
      doc.sha1 = _.sha1(`${doc.at}|${doc.date}|${this.text}`);
      this.storage.insert(doc, () => {
        debug('Pus#commit', 'ok');
        _.stdout([doc]);
        if (cb) {
          cb(doc.sha1.slice(0, 7));
        }
      });
    });
  }
}

class Collection extends Commit {
  run (cb) {
    this.flag = 'c';
    super.run(null, cb);
  }
}

class Log extends Command {
  query () {
    let query = { flag: /[\.\-oxc]/ };
    if (this.task) {
      query.flag = /\./;
    } else if (this.event) {
      query.flag = /o/;
    } else if (this.note) {
      query.flag = /-/;
    } else if (this.done) {
      query.flag = /x/;
    } else if (this.collection) {
      query.flag = /c/;
    }

    if (this.date) {
      query.date = { $gte: this.date };
    }

    return query;
  }
  run () {
    let options = {
      limit: this.limit || 100
    };

    this.storage.find(this.query(), options, _.stdout);
  }
}

class Grep extends Log {
  query () {
    let query = super.query();
    query.text = new RegExp(this.exp);
    return query;
  }
}

class Status extends Log {
  query () {
    let query = super.query();
    query.flag = '.';
    return query;
  }
}

class Pus {
  constructor (opts) {
    this.StorageKlass = LocalStorage;
    this.storage = new this.StorageKlass({
      env: opts.env || '',
      isReady: this.isReady.bind(this)
    });
  }

  run() {
    this.storage.connect();
  }

  isReady () {
    debug(`${name} is ready`);
    program.parse(process.argv);
  }

  exec (name, ...args) {
    this[name].apply(this, args);
  }

  commit (text, options) {
    options.text = text;
    let cmd = new Commit(this.storage, options);
    cmd.run();
  }

  collection (text, options) {
    options.text = text;
    let cmd = new Collection(this.storage, options);
    cmd.run();
  }

  log (options) {
    let cmd = new Log(this.storage, options);
    cmd.run();
  }

  grep (exp, options) {
    options.exp = exp;
    let cmd = new Grep(this.storage, options);
    cmd.run();
  }

  done (sha1, options) {
    options.sha1 = sha1;
    let cmd = new Done(this.storage, options);
    cmd.run();
  }

  show (sha1, options) {
    options.sha1 = sha1;
    let cmd = new Show(this.storage, options);
    cmd.run();
  }

  status (options) {
    let cmd = new Status(this.storage, options);
    cmd.run();
  }
}

let pus = new Pus({ env: process.env.NODE_ENV });

program
  .description(`${name} is a rapid personnal logging system.`)
  .version(pk.version);

program
  .command('commit <text>')
  .alias('ci')
  .description('run commit commands to add new entries in your journal')
  .option('-t, --task', 'commit as a task')
  .option('-o, --event', 'commit as an event')
  .option('-n, --note', 'commit as a note')
  .option('-c, --collection <sha1>', 'commit as a collection or link to it')
  .option('-d, --date <date>', 'force date, format YYYY-MM-DD, default today')
  .option('-l, --limit <number>', 'extend characters limitation, default 59')
  .action(pus.exec.bind(pus, 'commit'));

program
  .command('collection <text>')
  .alias('c')
  .description('manage collections')
  .option('-d, --date <date>', 'force date, format YYYY-MM-DD, default today')
  .option('-l, --limit <number>', 'extend characters limitation, default 59')
  .action(pus.exec.bind(pus, 'collection'));

program
  .command('log')
  .description('show commit logs')
  .option('-l, --limit <limit>', 'limit number of results, default 100')
  .option('-d, --date <date>', 'show all task since date')
  .option('-t, --task', 'show only tasks')
  .option('-o, --event', 'show only events')
  .option('-n, --note', 'show only notes')
  .option('-x, --done', 'show only done tasks')
  .option('-c, --collection', 'show only collections')
  .action(pus.exec.bind(pus, 'log'));

program
  .command('grep <exp>')
  .description('grep commits')
  .option('-l, --limit <limit>', 'limit number of results, default 100')
  .option('-d, --date <date>', 'show all task since date')
  .option('-t, --task', 'show only tasks')
  .option('-o, --event', 'show only events')
  .option('-n, --note', 'show only notes')
  .option('-x, --done', 'show only done tasks')
  .option('-c, --collection', 'show only collections')
  .action(pus.exec.bind(pus, 'grep'));

program
  .command('status')
  .alias('st')
  .description('show tasks')
  .option('-l, --limit <limit>', 'limit number of results, default 100')
  .option('-d, --date <date>', 'show all task since date')
  .action(pus.exec.bind(pus, 'status'));

program
  .command('done <sha1>')
  .description('done a task using its sha1')
  .action(pus.exec.bind(pus, 'done'));

program
  .command('show <sha1>')
  .description('show a task using its sha1 or a collection')
  .action(pus.exec.bind(pus, 'show'));

program
  .command('*')
  .action((cmd) => {
    console.log('unknow command "%s"', cmd);
  });

pus.run();

module.exports = {_, program, LocalStorage, Commit, Collection};
