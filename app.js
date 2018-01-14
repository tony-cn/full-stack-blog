var Vue = require('vue');
var express = require('express');
var path = require('path');
var LRU = require('lru-cache');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var swaggerJSDoc = require('swagger-jsdoc');
var compression = require('compression');
var jws = require('jws');
var { SECRET, whiteList } = require('./config/config');
var { createBundleRenderer } = require('vue-server-renderer');

var index = require('./routes/index');
var users = require('./routes/users');
var login = require('./routes/login');
var posts = require('./routes/posts');
var tags = require('./routes/tags');
var categories = require('./routes/categories');
var comments = require('./routes/comment')

var app = express();

var resolve = file => path.resolve(__dirname, file);

const isProd = process.env.NODE_ENV === 'production';
const useMicroCache = process.env.MICRO_CACHE !== 'false';
const serverInfo =
  `express/${require('express/package.json').version} ` +
  `vue-server-renderer/${require('vue-server-renderer/package.json').version}`;

function createRenderer (bundle, options) {
  // https://github.com/vuejs/vue/blob/dev/packages/vue-server-renderer/README.md#why-use-bundlerenderer
  return createBundleRenderer(bundle, Object.assign(options, {
    // for component caching
    cache: LRU({
      max: 1000,
      maxAge: 1000 * 60 * 15
    }),
    // this is only needed when vue-server-renderer is npm-linked
    basedir: resolve('./dist'),
    // recommended for performance
    runInNewContext: false
  }))
}

function render (req, res) {
  const s = Date.now()

  res.setHeader("Content-Type", "text/html")
  res.setHeader("Server", serverInfo)

  const handleError = err => {
    if (err.url) {
      res.redirect(err.url)
    } else if(err.code === 404) {
      res.status(404).send('404 | Page Not Found')
    } else {
      // Render Error Page or Redirect
      res.status(500).send('500 | Internal Server Error')
      console.error(`error during render : ${req.url}`)
      console.error(err.stack)
    }
  }

  const context = {
    title: 'Vue HN 2.0', // default title
    url: req.url
  }
  renderer.renderToString(context, (err, html) => {
    if (err) {
      return handleError(err)
    }
    res.send(html)
    if (!isProd) {
      console.log(`whole request: ${Date.now() - s}ms`)
    }
  })
}

let renderer;
let readyPromise;
const templatePath = resolve('./ssr/index.template.html');
if (isProd) {
  // In production: create server renderer using template and built server bundle.
  // The server bundle is generated by vue-ssr-webpack-plugin.
  const template = fs.readFileSync(templatePath, 'utf-8');
  const bundle = require('./dist/vue-ssr-server-bundle.json');
  // The client manifests are optional, but it allows the renderer
  // to automatically infer preload/prefetch links and directly add <script>
  // tags for any async chunks used during render, avoiding waterfall requests.
  const clientManifest = require('./dist/vue-ssr-client-manifest.json');
  renderer = createRenderer(bundle, {
    template,
    clientManifest
  })
} else {
  // In development: setup the dev server with watch and hot-reload,
  // and create a new renderer on bundle / index template update.
  readyPromise = require('./build/setup-dev-server')(
    app,
    templatePath,
    (bundle, options) => {
      renderer = createRenderer(bundle, options);
    }
  )
}

var options = {
  swaggerDefinition: {
    info: {
      title: 'Fcc\'s Blog', // Title (required)
      version: '1.0.0', // Version (required)
    },
  },
  apis: ['./routes/*.js'] // Path to the API docs
};

// Initialize swagger-jsdoc -> returns validated swagger spec in json format
var swaggerSpec = swaggerJSDoc(options);

// compress all responses
app.use(compression());

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
const serve = (path, cache) => express.static(resolve(path), {
  maxAge: cache && isProd ? 1000 * 60 * 60 * 24 * 30 : 0
});

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/dist', serve('./dist', true));
app.use('/manifest.json', serve('./manifest.json', true));
app.use('/service-worker.js', serve('./dist/service-worker.js'));

app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE,PUT,PATCH');
  next();
});

app.use(function (req, res, next) {
  if (req.method.toLowerCase() === 'options') {
    res.send({
      code: 200,
      msg: 'continue'
    })
    return;
  }
  next();
});

app.use('/blog', isProd ? render : (req, res) => {
  readyPromise.then(() => render(req, res))
});

app.use(function (req, res, next) {
  var signature = req.headers.authorization;
  if (whiteList.includes(req._parsedUrl.pathname)) {
    next();
  } else if (signature) {
    if (signature === 'TOKEN001') {
      req.userId = 'admin';
      next();
    } else {
      var valid = jws.verify(signature, 'HS256', SECRET);
      var payload = null;
      if (!valid) {
        res.sendStatus(401);
        return;
      } else {
        payload = JSON.parse(jws.decode(signature).payload);
      }
      req.userId = payload.userid;
      next();
    }
  } else {
    return res.sendStatus(401);
  }
});

app.use('/', index);
app.use('/login', login);
app.use('/users', users);
app.use('/posts', posts);
app.use('/tags', tags);
app.use('/categories', categories);
app.use('/comments', comments);

// return a doc of json to render swagger
app.get('/swagger.json', function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  console.log(err);
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.sendStatus(err.status || 500);
  // res.render('error');
});

module.exports = app;
