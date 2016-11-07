'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const _ = require('../')._;
const Commit = require('../').Commit;
const LocalStorage = require('../').LocalStorage;

const HOME = process.env.HOME;

let storage;
let err = _.err;

describe('Commit', () => {
  beforeEach((done) => {
    let testFilename = path.join(HOME, '.pus', 'commits-test.db');
    if (fs.existsSync(testFilename)) {
      fs.unlinkSync(testFilename);
    }

    storage = new LocalStorage({
      env: 'test',
      isReady: done
    });
    storage.connect();
  });

  after(() => {
    _.err = err;
  });
  
  it('should assign options and have a storage', () => {
    let commit = new Commit(storage, { foo: 'bar', options: [], text: '' });
    assert.equal(commit.foo, 'bar');
    assert.deepEqual(storage, commit.storage);
  });
  it('should set defaults', () => {
    let commit = new Commit(storage, { foo: 'bar', options: [], text: '' });
    assert.equal(commit.limit, 59);
    assert.equal(commit.date, new Date().toJSON().slice(0, 10));
  });
  it('should have a validator and validate', () => {
    let noErr = true;
    _.err = () => {
      noErr = false;
    };
    let commit = new Commit(storage, { foo: 'bar', options: [], text: 'foo' });
    assert.ok(commit.validator);
    assert.ok(noErr);
  });
  it('should insert a note', (done) => {
    let commit = new Commit(storage, { options: [], text: 'Hello World' });
    commit.run(null, (sha1) => {
      storage.findOne({ sha1: new RegExp(`^${sha1}`) }, (doc) => {
        assert.equal(doc.text, '- Hello World');
        assert.equal(doc.flag, '-');
        assert.ok(!doc.collection);
        done();
      });
    });
  });
  it('should insert a note with a flag', (done) => {
    let options = [{ long: '--note' }];
    let commit = new Commit(storage, { options, text: 'Hello World' });
    commit.run(null, (sha1) => {
      storage.findOne({ sha1: new RegExp(`^${sha1}`) }, (doc) => {
        assert.equal(doc.text, '- Hello World');
        assert.equal(doc.flag, '-');
        assert.ok(!doc.collection);
        done();
      });
    });
  });
  it('should insert an event', (done) => {
    let options = [{ long: '--event' }];
    let commit = new Commit(storage, {
      event: true,
      options,
      text: 'Hello World'
    });
    commit.run(null, (sha1) => {
      storage.findOne({ sha1: new RegExp(`^${sha1}`) }, (doc) => {
        assert.equal(doc.text, 'o Hello World');
        assert.equal(doc.flag, 'o');
        assert.ok(!doc.collection);
        done();
      });
    });
  });
  it('should insert a task', (done) => {
    let options = [{ long: '--task' }];
    let commit = new Commit(storage, {
      task: true,
      options,
      text: 'Hello World'
    });
    commit.run(null, (sha1) => {
      storage.findOne({ sha1: new RegExp(`^${sha1}`) }, (doc) => {
        assert.equal(doc.text, '. Hello World');
        assert.equal(doc.flag, '.');
        assert.ok(!doc.collection);
        done();
      });
    });
  });
  it('should insert a note in a collection', (done) => {
    let options = [{ long: '--note' }, { long: '--collection' }];
    let commit = new Commit(storage, {
      collection: 'col-sha1',
      note: true,
      options,
      text: 'Hello World'
    });
    commit.run(null, (sha1) => {
      storage.findOne({ sha1: new RegExp(`^${sha1}`) }, (doc) => {
        assert.equal(doc.text, '- Hello World');
        assert.equal(doc.flag, '-');
        assert.equal(doc.collection, 'col-sha1');
        done();
      });
    });
  });
});
