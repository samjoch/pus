'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const LocalStorage = require('../').LocalStorage;

const HOME = process.env.HOME;

describe('LocalStorage', () => {
  let doc = {};

  before(() => {
    let testFilename = path.join(HOME, '.pus', 'commits-test.db');
    if (fs.existsSync(testFilename)) {
      fs.unlinkSync(testFilename);
    }
  });
  it('should have dot folder path', () => {
    let storage = new LocalStorage();
    assert.equal(storage.dotpath, `${HOME}/.pus`);
  });
  it('should create a dotfile folder', () => {
    let storage = new LocalStorage();
    assert.ok(fs.existsSync(storage.dotpath));
  });
  it('should have a production path', () => {
    let storage = new LocalStorage();
    assert.equal(storage.path, `${HOME}/.pus/commits.db`);
  });
  it('should have a test path', () => {
    let storage = new LocalStorage({ env: 'test' });
    assert.equal(storage.path, `${HOME}/.pus/commits-test.db`);
  });
  it('should connect to db', (done) => {
    let storage = new LocalStorage({
      env: 'test',
      isReady: () => {
        assert.ok(storage.docs);
        done();
      }
    });
    storage.connect();
  });
  it('should insert a doc', (done) => {
    let line = new RegExp("{\"foo\":\"bar\",\"_id\":\".*\"}");
    let storage = new LocalStorage({ env: 'test', isReady: () => {
      storage.insert({ foo: 'bar' }, () => {
        let db = fs.readFileSync(storage.path).toString();
        assert.ok(line.test(db));
        done();
      });
    }});
    storage.connect();
  });
  it('should insert a new doc', (done) => {
    let line = new RegExp("{\"foo2\":\"bar2\",\"_id\":\".*\"}");
    let storage = new LocalStorage({ env: 'test', isReady: () => {
      storage.insert({ foo2: 'bar2' }, () => {
        let db = fs.readFileSync(storage.path).toString().split('\n')[1];
        assert.ok(line.test(db));
        done();
      });
    }});
    storage.connect();
  });
  it('should count docs', (done) => {
    let storage = new LocalStorage({ env: 'test', isReady: () => {
      storage.count((count) => {
        assert.equal(count, 2);
        done();
      });
    }});
    storage.connect();
  });
  it('should find docs', (done) => {
    let storage = new LocalStorage({ env: 'test', isReady: () => {
      storage.find({ foo: 'bar' }, {}, (docs) => {
        assert.equal(docs.length, 1);
        done();
      });
    }});
    storage.connect();
  });
  it('should find one doc', (done) => {
    let storage = new LocalStorage({ env: 'test', isReady: () => {
      storage.findOne({ foo: 'bar' }, (_doc) => {
        doc = _doc;
        assert.ok(doc._id);
        assert.equal(doc.foo, 'bar');
        done();
      });
    }});
    storage.connect();
  });
  it('should update doc', () => {
    let storage = new LocalStorage({ env: 'test', isReady: () => {
      storage.update({ _id: doc._id }, { $set: { flag: 'x' } }, () => {
        storage.findOne({ _id: doc._id }, (_doc) => {
          assert.assert(doc._id, _doc._id);
          assert.equal(doc.foo, 'bar');
          assert.equal(doc.flag, 'x');
          done();
        });
      });
    }});
    storage.connect();
  });
});
