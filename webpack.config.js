const path = require('path')
const webpack = require('webpack')

const isDevelopment = process.env.NODE_ENV === 'development'

module.exports = {
  mode: isDevelopment ? 'development' : 'production',
  context: path.resolve(__dirname, isDevelopment ? 'app' : 'dist'),
  devtool: 'source-map',
  entry: {
    main: './client/main-app.js',
  },
  output: {
    path: path.join(__dirname, 'assets/webpack'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.js$|\.jsx$/,
        exclude: /node_modules/,
        use: 'babel-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.*', '.js', '.jsx'],
    alias: {
      // When civil-client is npm-linked, ensure only one copy of React is used
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      // webpack-dev-server v6 client imports 'process/browser'; resolve to the .js file
      'process/browser': require.resolve('process/browser.js'),
    },
    fallback: {
      fs: false, // logger wants to require fs though it's not needed on the browser
      path: require.resolve('path-browserify'),
      stream: require.resolve('stream-browserify'),
      os: require.resolve('os-browserify/browser'),
      zlib: require.resolve('browserify-zlib'),
      constants: require.resolve('constants-browserify'),
      buffer: require.resolve('buffer'),
      assert: require.resolve('assert/'),
    },
  },
  optimization: {
    // Prevent webpack from replacing process.env.NODE_ENV at build time so
    // runtime code in main.js can set/read it dynamically on the browser.
    nodeEnv: false,
  },
  ...(isDevelopment && {
    devServer: {
      allowedHosts: 'all', // not recommended but could be 'auto' but we want to allow devices on the LAN - this is only for development
      hot: 'only',
      host: '0.0.0.0',
      port: 3011,
      client: {
        overlay: {
          errors: true,
          warnings: false,
        },
      },
      proxy: [
        {
          // proxy all traffic other than publicPath (/assets/webpack/) to the node server
          context: () => true,
          target: 'http://localhost:3012', // this is where the node server of the application is really running
        },
      ],
      compress: true,
      devMiddleware: {
        index: false, // disable index.html fallback so root requests are proxied to the node server
        publicPath: '/assets/webpack/', // in main.js also ass if(typeof ___webpack_public_path__ !== 'undefined' __webpack_public_path__ = "http://localhost:3011/assets/webpack/";  // this is where the hot loader sends requests to
      },
    },
  }),
  plugins: [
    new webpack.IgnorePlugin({ resourceRegExp: /nodemailer/ }), // not used in the client side - those should be move outside of the app directory
    new webpack.NormalModuleReplacementPlugin(/.+models\/.+/, isDevelopment ? '../models/client-side-model' : '/client/client-side-model'), // do not include models on the client side - the app/api files contain server side and client side code
    new webpack.NormalModuleReplacementPlugin(/.+\/the-civil-server\.js$/, '/client/client-side-model'), // on the clientsite map imports of civil-server to an empty module
    new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] }), // Work around for Buffer is undefined: https://github.com/webpack/changelog-v5/issues/10
    new webpack.ProvidePlugin({ process: 'process/browser' }), // fix "process is not defined" error: // (do "npm install process" before running the build)
  ],
}
