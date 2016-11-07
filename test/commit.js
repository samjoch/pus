'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const _ = require('../')._;
const Commit = require('../').Commit;
const Collection = require('../').Collection;
const LocalStorage = require('../').LocalStorage;

const HOME = process.env.HOME;

let storage;
let err = _.err;
let stdout = _.stdout;

let hook = {
  beforeEach (done) {
    storage = new LocalStorage({
      inMemory: true,
      env: 'test',
      isReady: done
    });
    storage.connect();
  },
  after () {
    _.err = err;
    _.stdout = stdout;
  }
};

describe('Commit', () => {
  beforeEach(hook.beforeEach);
  after(hook.after);

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
    let shouldStdout = false;
    _.stdout = () => {
      shouldStdout = true;
    };
    let commit = new Commit(storage, { options: [], text: 'Hello World' });
    commit.run(null, (sha1) => {
      storage.findOne({ sha1: new RegExp(`^${sha1}`) }, (doc) => {
        assert.equal(doc.text, '- Hello World');
        assert.equal(doc.flag, '-');
        assert.ok(!doc.collection);
        assert.ok(shouldStdout);
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

describe('Collection', () => {
  beforeEach(hook.beforeEach);
  after(hook.after);

  it('should insert a new collection', (done) => {
    let options = [];
    let collection = new Collection(storage, {
      options,
      text: 'New collection'
    });
    collection.run((sha1) => {
      storage.findOne({ sha1: new RegExp(`^${sha1}`) }, (doc) => {
        assert.equal(doc.text, 'c New collection');
        assert.equal(doc.flag, 'c');
        assert.ok(!doc.collection);
        done();
      });
    });
  });
});
