Atma Loader Abstraction
-----

Used for the atma plugin creation to develop File `read` middleware, like compilers and preprocessors.

Extends:

- [`IncludeJS`](https://github.com/atmajs/IncludeJS) with a custom loader
- [`atma-io`](https://github.com/atmajs/atma-io) with a custom middleware to read/compile/preprocess files
- [`atma-server`](https://github.com/atmajs/atma-server) and [`Atma Toolkit`](https://github.com/atmajs/Atma.Toolkit) with a `HTTPHandler` to serve compiled sources (with **sourceMap** support)


For usage examples refer to:
- [atma-loader-traceur](https://github.com/atmajs/atma-loader-traceur)
- [atma-Loader-less](https://github.com/atmajs/atma-loader-less)
- [atma-loader-package](https://github.com/tenbits/atma-loader-package)

#### API

###### create
```javascript
module.exports.create = function(data, ICompiler):AtmaPlugin

/*
 * - data Object {
 *      name: String > Plugin Loader Name
 *      options: {
 *          mimeType: String > mimeType of the resource
 *          extensions: [String] > file extensions to bind the middleware to
 *          ... > other configuration, which is then passed to compiler
 *      }
 *  }
 *
 * - ICompiler Object {
 *      compile: function(source String, filepath String, config Object): ICompilationResult
 *      ?compileAsync: function(source, filepath, config): Deferred<ICompilationResult>
 *  }
 *
 *  ICompilationResult: {
 *      content: String > Should contain compiled result
 *      ?sourceMap: String > optional, Source Maps
 *  }
 */
```

`options` could be extended then via `package.json`. Example:
```json
{
    "atma": {
        "settings": {
            "%loader-name%": {
                "foo": "baz"
            }
        }
    }
}

```

----
_(c) MIT License - Atma.js Project_