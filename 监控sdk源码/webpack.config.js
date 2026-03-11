const path = require('path');
const webpack = require('webpack');
const packageJson = require('./package.json');

module.exports = {
  entry: './src/core/monitor_sdk.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'monitor.min.js',
    sourceMapFilename: 'monitor.min.js.map',  // 🆕 SourceMap文件名
    library: {
      name: 'WebMonitor',
      type: 'umd'
    },
    globalObject: 'this'
  },
  mode: 'production',
  devtool: 'hidden-source-map',  // 🆕 生成SourceMap但不引用
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
  },
  resolve: {
    extensions: ['.js']
  },
  plugins: [
    // 🆕 注入SDK版本号
    new webpack.DefinePlugin({
      __SDK_VERSION__: JSON.stringify(packageJson.version)
    })
  ]
};