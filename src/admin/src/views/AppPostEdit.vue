<template>
  <div class="post-edit">
    <div class="post-top-field-wp-left">
      <div class="post-top-field">
        <label class="short-label" for="postTitle">标题</label>
        <el-input
          id="postTitle"
          class="post-title"
          v-model="title"
          clearable />
      </div>
      <div class="post-top-field">
        <label class="short-label" for="postAbstract">摘要</label>
        <el-input
          id="postAbstract"
          class="post-abstract"
          v-model="abstract"
          type="textarea" />
      </div>
      <div class="post-top-field">
        <label class="short-label" for="postPoster">海报</label>
        <div>
          <el-upload
            id="postPoster"
            class="post-poster"
            action=""
            list-type="picture-card"
            :auto-upload="false"
            :file-list="poster"
            :on-change="changePoster"
            :on-remove="changePoster"
            >
          Poster
          </el-upload>
        </div>
      </div>
    </div><!--
      取消间隔
     --><div class="post-top-field-wp-right">
      <div class="post-top-field">
        <label class="short-label" for="postTag">标签</label>
        <el-select
          id="postTag"
          v-model="tagsSelected"
          multiple
          placeholder="请选择标签">
          <el-option
            v-for="tag in tagList"
            :key="tag._id"
            :label="tag.name"
            :value="tag._id" />
        </el-select>
      </div>
      <div class="post-top-field">
        <label class="short-label" for="postCategory">分类</label>
        <el-cascader
          id="postCategory"
          v-model="category"
          :options="categoryList"
          :props="{value:'_id','label':'name',children:'children'}"
          clearable
          placeholder="请选择分类" />
      </div>
      <div class="post-top-field">
        <label class="short-label" for="postStatus">状态</label>
        <el-radio-group id="postStatus" v-model="status">
          <el-radio-button label="1">发布</el-radio-button>
          <el-radio-button label="2">私有</el-radio-button>
        </el-radio-group>
      </div>
    </div>
    <div class="padding-b-20">
      <mavon-editor v-model="content" />
    </div>
    <el-button
      class="box-content"
      type="primary"
      :disabled="disabled"
      :loading="submiting"
      @click="submit">保存</el-button>
  </div>
</template>

<script>
import elTab from './../assets/mixins/elTab.js';
import util from './../assets/js/util.js';

export default {
  name: 'PostEdit',
  mixins: [elTab],
  data() {
    return {
      title: '',
      content: '',
      abstract: '',
      status: '',
      tagsSelected: [],
      category: [],
      poster: [],
      _id: '',

      tagList: [],
      categoryList: [],

      modified: false,
      submiting: false
    };
  },
  computed: {
    disabled() {
      return !(this.title && this.content && this.abstract);
    },
    postId() {
      return this.$route.params.id;
    }
  },
  watch: {
    title(title) {
      this.modified = true
    },
    content() {
      this.modified = true
    },
    abstract() {
      this.modified = true
    },
    tagsSelected() {
      this.modified = true
    },
    '$route.path'() {
      this.getPost();
      this.modified = false;
    }
  },
  beforeRouteEnter(to, from, next) {
    console.log(1);
    next(vm => {
      vm.getPost();
      vm.modified = false;
    })
  },
  beforeRouteUpdate(to, from, next) {
    this.confirmLeave(to, from, next);
  },
  beforeRouteLeave(to, from, next) {
    this.confirmLeave(to, from, next);
  },
  created() {
    this.addTab('编辑文章', this.$route.fullPath, 'iconfont icon-wenzhang');
    this.getTags();
    this.getCategories();
  },
  methods: {
    async submit() {
      const params = {
        title: this.title,
        content: this.content,
        abstract: this.abstract,
        tags: this.tagsSelected.join(','),
        category: this.category.join(','),
        publishStatus: this.status,
        _id: this._id
      }
      if (this.poster.length > 0 && this.poster[0].raw) {
        params.poster = this.poster[0].raw;
      }
      try {
        this.submiting = true;
        await this.api.editPost(params);
        this.modified = false;
        this.changeTabTitle(this.title);
      } catch (error) {
        console.error(error);
      } finally {
        this.submiting = false;
      }
    },
    async getPost() {
      const params = {
        _id: this.postId
      }
      try {
        const { sources } = await this.api.getPost(params);
        if (sources && sources.length > 0) {
          this.updatePost(sources[0]);
        }
      } catch (error) {
        console.error(error);
      }
    },
    async getTags() {
      try {
        const { sources } = await this.api.getTags();
        this.tagList = sources;
      } catch (error) {
        console.error(error);
      }
    },
    async getCategories() {
      try {
        const { sources } = await this.api.getCategory();
        sources.push({
          _id: '0',
          pId: '-1',
          name: '全部'
        });
        this.categoryList = util.list2tree(sources, '0', {
          id: '_id',
          pId: 'pId',
          label: 'name'
        })[0].children || [];
      } catch (error) {
        console.error(error);
      }
    },
    updatePost(post) {
      const { title, content, abstract, tags, _id, category, publishStatus, poster } = post;
      this.title = title;
      this.content = content;
      this._id = _id;
      this.abstract = abstract;
      this.status = publishStatus;
      this.tagsSelected = tags.map(tag => tag && tag._id).filter(Boolean);
      this.category = category.map(cate => cate && cate._id).filter(Boolean);
      if (poster) {
        this.poster = [{
          name: 'poster',
          url: poster
        }]
      };
      this.changeTabTitle(title);
      this.$nextTick(() => {
        this.modified = false;
      });
    },
    changePoster(file, fileList) {
      if (fileList.length > 1) {
        fileList.shift();
      }
      console.log(fileList);
      this.poster = fileList;
    },
    confirmLeave(to, from, next) {
      if (this.modified) {
        this.$msgbox({
          title: '提示',
          message: '离开此页面后，未保存的内容将被清空，请确保您已保存！是否离开？',
          showCancelButton: true,
          confirmButtonText: '我要走别拦我！',
          cancelButtonText: '好吧，留下来',
          beforeClose: (action, instance, done) => {
            if (action === 'confirm') {
              next();
            }
            done();
          }
        }).catch(() => {
          this.$store.commit('setActivedTabByRoute', from.fullPath);
        });
      } else {
        next();
      }
    },
    changeTabTitle(title) {
      this.$store.commit('setTagNameByRoute', {
        route: this.$route.path,
        label: title
      });
    }
  }
}
</script>

<style scoped>
.post-edit{
  position: relative;
}
.post-top-field-wp-left{
  display: inline-flex;
  justify-content: flex-start;
  flex-wrap: wrap;
  width: 40%;
}
.post-top-field-wp-left .post-top-field{
  width: 100%;
}
.post-top-field-wp-right .post-top-field{
  max-width: 260px;
}
.post-top-field-wp-right{
  display: inline-flex;
  justify-content: flex-start;
  flex-wrap: wrap;
  width: 60%;
}
.post-top-field{
  display: flex;
  align-items: center;
  padding: 5px 10px;
  margin-right: 20px;
  margin-bottom: 15px;
  border-radius: 4px;
  background-color: #fff;
  box-shadow: 0 0 2px 1px #33419030;
}
.post-edit >>> .v-note-wrapper{
  height: 500px;
}
.post-edit >>> .v-note-wrapper.fullscreen{
  height: 100%;
}
.post-edit >>> .el-select__tags{
  height: 28px;
  padding: 0 5px;
  overflow: hidden;
}
.post-edit >>> .el-select__tags>span{
  white-space: nowrap;
  display: block;
  width: 170px;
  overflow: auto;
}
.post-edit >>> #postTag{
  height: 32px !important;
}
.post-edit >>> .el-select__tags .el-tag{
  margin: 2px 0 2px 6px;
}
.post-edit >>> .el-upload--picture-card {
  height: 36px;
  line-height: 34px;
}
</style>
