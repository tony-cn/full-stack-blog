const { mongoose, connection } = require('./connect')
const { tagsSchema, Tags } = require('./tags')

const { ObjectId } = mongoose.Schema.Types

/**
 * title: 文章名
 * abstract: 文章简介
 * authorId: 作者id
 * authorName: 作者名
 * content: 文章内容
 * date: 文章日期
 * publishStatus: 发布状态 1: 公开 2: 私有 3: 回收
 * category: 文章分类id
 * tags: 标签Id数组
 */
const posts = {
  title: {
    type: String,
    required: true
  },
  abstract: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  renderedContent: {
    type: String,
    required: true
  },
  poster: {
    type: String
  },
  date: {
    type: Date,
    required: true
  },
  publishStatus: {
    type: String,
    enum: ['私有', '发布', '回收'],
    required: true
  },
  publishDate: {
    type: Date,
    required: true
  },
  authorId: {
    type: ObjectId
  },
  authorName: {
    type: String
  },
  viewCount: {
    type: Number,
    default: 0
  },
  category: [ObjectId],
  tags: [ObjectId]
}

const postsSchema = new mongoose.Schema(posts)
postsSchema.methods.$_getReleatedTags = function() {
  const tagIds = this.tags
  return new Promise(function(resolve, reject) {
    if (tagIds.length > 0) {
      const promises = []
      tagIds.forEach(id => {
        promises.push(
          Tags.findById(id)
            .select('_id name')
            .exec()
        )
      })
      Promise.all(promises)
        .then(function(res) {
          resolve(res)
        })
        .catch(err => {
          reject(err)
        })
    } else {
      resolve([])
    }
  })
}

const Posts = mongoose.model('post', postsSchema)

module.exports.Posts = Posts

module.exports.postsSchema = postsSchema
