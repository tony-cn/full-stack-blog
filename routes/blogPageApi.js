const express = require('express');
const login = require('./login');
const jwtDecode = require('./../lib/util/jwsDecode');
const { Posts } = require('./../lib/models/posts');
const { Tags } = require('./../lib/models/tags');
const { Comments } = require('./../lib/models/comment');
const { Users } = require('./../lib/models/users');
const { Categories } = require('./../lib/models/categories');
const { findByIds, deleteByIds, deleteByIdsRecursive } = require('./../lib/controllers/crud');
const { hasMissing, formatDate } = require('./../lib/util/util');
const { collectVisit } = require('./../lib/util/collectVisit');
const { avatarUpload } = require('./../lib/util/avatarUpload');
const { uploadToQiniu, deleteFromQiniu } = require('./../lib/util/qiniu');
const { STATIC_PATH, SITE_PATH, STATIC_URL, AVATAR_PATH } = require('./../config/config');
const logger = require('./../lib/util/log');

const router = express.Router();

router.use('/login', login);

router.get('/posts', async function (req, res, next) {
  let { page = '1', size = '10' } = req.query;
  const { tag, sortBy, dir } = req.query;
  const query = {
    publishStatus: '1'
  };
  const field = '-__v -content';
  let sort = {
    date: -1
  };
  let total = 0;

  if (tag) {
    query.tags = { $in: [tag] };
  }
  if (sortBy && dir) {
    sort = {
      [sortBy]: dir
    };
  }
  console.log(sort);
  page = Number.parseInt(page, 10);
  size = Number.parseInt(size, 10);

  try {
    total = await Posts.find(query).count().exec();
  } catch (err) {
    logger.reqErr(err, req);
    res.send({
      code: 500,
      msg: err.errmsg || err.message || err,
      sources: null,
      total
    });
    return;
  }

  Posts.find(query)
    .lean()
    .sort(sort)
    .skip((page - 1) * size)
    .limit(size)
    .select(field)
    .exec(function (err, rows) {
      if (err) {
        logger.reqErr(err, req);
        res.send({
          code: 500,
          msg: err.errmsg || err.message,
          sources: null,
          total
        });
        return;
      }
      const promises = [];
      rows.forEach(row => {
        const tagsRaw = Array.isArray(row.tags) ? row.tags : [];
        const cateRaw = Array.isArray(row.category) ? row.category : [];
        
        promises.push(findByIds(Tags, tagsRaw, '-__v').then(tags => {
          row.tags = tags.filter(Boolean);
        }));
        promises.push(findByIds(Categories, cateRaw, '-__v').then(category => {
          row.category = category;
        }));
        promises.push(Comments.count({ postId: row._id }).exec().then(count => {
          row.commentCount = count;
        }));
        row.date = formatDate(row.date, 'YYYY-MM-DD hh:mm:ss');
      });
      Promise.all(promises).then((tagsMap) => {
        res.send({
          code: 200,
          msg: 'success',
          sources: rows,
          total
        });
      }).catch(err => {
        logger.reqErr(err, req);
        res.send({
          code: 500,
          msg: err.errmsg || err.message || err,
          sources: null,
          total
        });
      });
    });
});

router.get('/post/:id', async function (req, res, next) {
  const id = req.params.id;
  const promises = [];
  try {
    const hasVisit = await collectVisit(req);
    console.log(hasVisit);

    let post = await Posts.findById(id).select('-__v').exec();
    if (!hasVisit) {
      const oriViewCount = post.viewCount || 0;
      post.$set('viewCount', oriViewCount + 1);
      post.save();
    }

    post = post.toObject();
    const tagsRaw = Array.isArray(post.tags) ? post.tags : [];
    const cateRaw = Array.isArray(post.category) ? post.category : [];
    promises.push(findByIds(Tags, tagsRaw, '-__v').then(tags => {
      post.tags = tags;
    }));
    promises.push(findByIds(Categories, cateRaw, '-__v').then(category => {
      post.category = category;
    }));
    
    await Promise.all(promises);
    const nextPost = await Posts.find({ publishStatus: '1' }).sort('date').findOne({ date: { $gt: post.date } }).select('_id title').exec();
    const prevPost = await Posts.find({ publishStatus: '1' }).sort('-date').findOne({ date: { $lt: post.date } }).select('_id title').exec();

    post.date = formatDate(post.date, 'YYYY-MM-DD hh:mm:ss');
    post.prevPost = prevPost;
    post.nextPost = nextPost;
    res.send({
      code: 200,
      msg: 'success',
      source: post
    });
  } catch (err) {
    logger.reqErr(err, req);
    res.send({
      code: 500,
      msg: err.errmsg || err.message || err,
      sources: null
    });
  }
});

router.get('/comments', async function (req, res, next) {
  const { pId, postId, dateOrder, content } = req.query;
  let { page = '1', size = '10' } = req.query;
  let query = {};
  let total = 0;
  const sort = {
    createdDate: Number.parseInt(dateOrder, 10) || -1
  };

  page = Number.parseInt(page, 10);
  size = Number.parseInt(size, 10);
  if (postId) {
    query.postId = postId;
    if (pId === '0') {
      // 既有postId,又传入pId='0',表示获取文章的第一层评论列表.
      query.pId = '0';
    }
  }
  if (content) {
    // 根据内容过滤.
    query.content = new RegExp(content);
  }
  if (pId && pId !== '0') {
    // 如果有pId,且不是第一层,则不管其他条件
    query = { pId };
  }

  total = await Comments.find(query).count().exec();

  Comments
    .find(query)
    .lean()
    .sort(sort)
    .skip((page - 1) * size)
    .limit(size)
    .select('-__v')
    .exec(function (err, rows) {
      if (err) {
        logger.reqErr(err, req);
        res.send({
          code: 500,
          msg: err.errmsg || err.message,
          sources: null,
          total
        });
        return;
      }
      const promises = [];
      rows.forEach(row => {
        row.createdDate = formatDate(row.createdDate, 'YYYY-MM-DD hh:mm:ss');
        promises.push(Posts
          .findById(row.postId)
          .lean()
          .select('_id title')
          .exec()
          .then(post => {
            row.post = post;
          }));
        promises.push(Users
          .findById(row.authorId)
          .lean()
          .select('-__v -password')
          .exec()
          .then(user => {
            row.author = user;
          }));
        if (row.replyTo) {
          promises.push(Users
            .findById(row.replyTo)
            .lean()
            .select('-__v -password')
            .exec()
            .then(user => {
              row.replyTo = user || {
                _id: row.replyTo,
                username: '未知用户'
              };
            }));
        }
        if (row.pId === '0') {
          promises.push(Comments
            .find({ pId: row._id })
            .count()
            .exec()
            .then(count => {
              row.replyCount = count;
            }));
        }
      });
      Promise.all(promises).then(() => {
        res.send({
          code: 200,
          msg: 'success',
          sources: rows,
          total
        });
      }).catch(err => {
        logger.reqErr(err, req);
        res.send({
          code: 500,
          msg: err.errmsg || err.message,
          sources: null,
          total
        });
      });
    });
});

router.get('/tags', function (req, res, next) {
  Tags.find().lean().select('-__v').exec(function (err, rows) {
    if (err) {
      logger.reqErr(err, req);
      res.send({
        code: 500,
        msg: err.errmsg || err.message,
        sources: null
      });
      return;
    }
    Promise
      .all(rows.map(row => 
        Posts
          .count({ publishStatus: '1', tags: { $in: [row._id] } })
          .exec()
          .then(count => {
            row.postCount = count;
          })))
      .then(() => {
        res.send({
          code: 200,
          msg: 'success',
          sources: rows
        });
      });
  });
});

router.get('/tag', async function (req, res, next) {
  const { id } = req.query;

  try {
    const tag = await Tags.findById(id).lean().select('-__v').exec();
    res.send({
      code: 200,
      msg: 'success',
      source: tag
    });
  } catch (err) {
    logger.reqErr(err, req);
    res.send({
      code: 500,
      msg: err.errmsg || err.message,
      source: null
    });
  }
});

router.get('/user', async function (req, res, next) {
  const id = req.userId;
  const query = {
    _id: id
  };
  try {
    const user = await Users.findById(id).lean().select('-__v -password').exec();
    if (!user) {
      throw new Error('user not fonud!');
    }
    user.regDate = formatDate(user.regDate, 'YYYY-MM-DD hh:mm:ss');
    res.send({
      code: 200,
      msg: 'success',
      source: user
    });
  } catch (err) {
    logger.reqErr(err, req);
    res.send({
      code: 500,
      msg: err.errmsg || err.message,
      sources: null,
      total
    });
  }
});

router.post('/user', function (req, res, next) {
  const { username, password } = req.body;
  if (!username || !password) {
    res.send({
      code: 400,
      msg: '`username` and `password` are both required.'
    });
  }
  const user = {
    username,
    password,
    userPic: '',
    userType: '2',
    regDate: Date.now()
  };

  Users.create(user, function (err, newUser) {
    if (err) {
      logger.reqErr(err, req);
      res.send({
        code: 500,
        msg: err.errmsg || err.message,
        source: null
      });
      return;
    }
    const { username: name, userPic, regDate, _id } = newUser;
    res.send({
      code: 200,
      msg: 'success',
      source: {
        username: name,
        regDate,
        userPic: '',
        _id
      }
    });
  });
});

router.post('/comment', jwtDecode, function (req, res, next) {
  const { content, postId, authorId, pId = '0', status = '1', replyTo } = req.body;
  const missing = hasMissing({ content, postId, authorId });
  if (missing) {
    logger.reqErr(missing, req);
    res.send({
      code: 500,
      msg: missing,
      sources: null
    });
  }
  const comment = {
    content,
    postId,
    authorId,
    replyTo,
    pId,
    status,
    createdDate: Date.now()
  };
  const saveComment = function (comment, res) {
    Comments.create(comment, function (err, newComment) {
      const { _id } = newComment;
      if (err) {
        logger.reqErr(err, req);
        res.send({
          code: 500,
          msg: err.errmsg || err.message,
          sources: null
        });
        return;
      }
      res.send({
        code: 200,
        msg: 'success',
        sources: { _id }
      });
    });
  };

  const promises = [
    Posts.findById(postId).exec().then(post => {
      if (!post) {
        throw Error('there is no such post whose id is ' + postId);
      }
    }),
    Users.findById(authorId).exec().then(user => {
      if (!user) {
        throw Error('there is no such user whose id is ' + authorId);
      }
    })
  ];
  if (pId && pId !== '0') {
    promises.push(Comments.findById(pId).exec().then(comment => {
      if (!comment) {
        throw Error('there is no such comment whose id is ' + pId);
      }
    }));
  }
  Promise.all(promises).then(result => {
    saveComment(comment, res);
  }).catch(err => {
    logger.reqErr(err, req);
    res.send({
      code: 400,
      msg: err.errmsg || err.message || err,
      sources: null
    });
  });
});

router.delete('/comment', jwtDecode, async function (req, res, next) {
  const { userId, query } = req;
  const { id } = query;
  if (!userId) {
    return res.sendStatus(401);
  }
  if (!id) {
    return res.sendStatus(400);
  }

  try {
    const comment = await Comments.findById(id).lean().exec();
    if (userId !== comment.authorId) {
      return res.sendStatus(401);
    }
    await deleteByIdsRecursive(Comments, [id], 'pId');
    res.send({
      code: 200,
      msg: 'success',
      source: null
    });
  } catch (err) {
    logger.reqErr(err, req);
    res.send({
      code: 500,
      msg: err.errmsg || err.message || err,
      source: null
    });
  }
});

router.patch('/user/avatar', jwtDecode, avatarUpload, async function (req, res, next) {
  const { id } = req.body;
  try {
    const user = await Users.findById(id, '-__v -password').exec();
    if (!user) {
      throw new Error('未找到用户！');
    }
    const oriUserPic = user.userPic;
    if (oriUserPic) {
      const oriUserPicKey = oriUserPic.substring(oriUserPic.lastIndexOf('/') + 1);
      deleteFromQiniu(oriUserPicKey);
    }
    const qiniuRes = await uploadToQiniu(req.file.filename, req.file.path);
    if (!qiniuRes.url) {
      throw new Error('头像上传失败！');
    }
    user.$set('userPic', qiniuRes.url);
    await user.save();
    res.send({
      code: 200,
      msg: 'success',
      source: user
    });
  } catch (err) {
    logger.reqErr(err, req);
    res.send({
      code: 500,
      msg: err.errmsg || err.message,
      source: null
    });
  }
});

router.patch('/user/password', jwtDecode, async function (req, res, next) {
  const { id, oldPw, newPw } = req.body;
  try {
    const user = await Users.findById(id).exec();
    if (user.password === oldPw) {
      user.$set('password', newPw);
      await user.save();
      res.send({
        code: 200,
        msg: 'success',
        source: null
      });
    } else {
      res.send({
        code: 400,
        msg: '旧密码不正确!',
        source: null
      });
    }
  } catch (err) {
    logger.reqErr(err, req);
    res.send({
      code: 500,
      msg: err.errmsg || err.message,
      source: null
    });
  }
});

module.exports = router;
