import qs from 'qs';
import APIS from './serverApi';
import axiosUtil from './axioswp';
import assert from './assert';

const { removeAll, axioswp: axios } = axiosUtil;

const getPosts = function (params) {
  assert(params, [{
    field: 'page',
    type: 'number'
  }, {
    field: 'size',
    type: 'number'
  }]);
  return axios.get(APIS.posts, { params }).catch(err => {
    alert(err);
  });
};

const getNewestPosts = function () {
  const params = {
    size: 5
  };
  return axios.get(APIS.posts, { params }).catch(err => {
    console.log(err);
  });
};

const getNewestComments = function () {
  const params = {
    size: 5
  };
  return axios.get(APIS.comments, { params }).catch(err => {
    console.log(err);
  });
};

const getTags = function () {
  return axios.get(APIS.tags).catch(err => {
    console.log(err);
  });
};

const getPostDetail = function (id) {
  return axios.get(`${APIS.post}/${id}`).catch(err => {
    console.log(err);
  });
};

const getUserInfo = function (id) {
  return axios.get(APIS.user, {
    needAuth: true
  }).catch(err => {
    console.log(err);
  });
};

const login = function (params) {
  assert(params, [{
    field: 'username',
    required: true,
    type: 'string'
  }, {
    field: 'password',
    required: true,
    type: 'string'
  }]);
  return axios.post(APIS.login, params);
};

const newCommment = function (params) {
  assert(params, [{
    field: 'content',
    required: true,
    type: 'string'
  }, {
    field: 'postId',
    required: true,
    type: 'string'
  }, {
    field: 'authorId',
    required: true,
    type: 'string'
  }]);
  return axios.post(APIS.comment, params, {
    needAuth: true
  });
};

const getPostComments = function (postId) {
  const params = {
    postId,
    pId: '0'
  };
  assert(params, [{
    field: 'postId',
    required: true,
    type: 'string'
  }]);
  return axios.get(APIS.comments, { params });
};

const getSubComments = function (params) {
  assert(params, [{
    field: 'postId',
    required: true,
    type: 'string'
  }, {
    field: 'pId',
    required: true,
    type: 'string'
  }]);
  return axios.get(APIS.comments, { params });
};

export {
  getPosts,
  getTags,
  getNewestPosts,
  getNewestComments,
  getPostDetail,
  getUserInfo,
  login,
  newCommment,
  getPostComments,
  getSubComments
};
