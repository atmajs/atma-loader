///
/// Should be used in DEV environment only. Compile es6 scripts for production afterwards.
///

(function(){
	
	module.exports = {
		create: create
	};

	/**
	 *	data:
	 *		name:
	 *		options:
	 *			mimeType:
	 *			extensions:
	 *		sourceMapType: 'embedded|separate|none'
	 *
	 *	Compiler:
	 *		compile: function(source, filepath, config): { content, ?sourceMap}
	 *		?compileAsync: function(source, filepath, config, function(error, {content, ?sourceMap})):
	 */
	function create(data, Compiler, Loader){
		var name = data.name,
			options = getOptions(name, data.options)
			;
		
		create_IncludeLoader(name, options, Compiler, Loader);
		
		Compiler
			&& create_FileMiddleware(name, options, Compiler);
		Loader
			&& create_FileLoader(name, options, Loader);
		
		var HttpHandler = create_HttpHandler(name, options, Compiler);
		return {
			attach: function(app){
				options.extensions.forEach(function(ext){
					var rgx = '((\\.EXT$)|(\\.EXT\\?))'.replace(/EXT/g, ext),
						rgx_map = '((\\.EXT\\.map$)|(\\.EXT\\.map\\?))'.replace(/EXT/g, ext);
					
					app.handlers.registerHandler(rgx, HttpHandler);
					app.handlers.registerHandler(rgx_map, HttpHandler);
				});
			},
			register: function(rootConfig){}
		}
	}

	var File = global.io && global.io.File || require('atma-io').File;
	var Class = require('atma-utils').class;
		
	function create_FileMiddleware(name, options, Compiler){
		var Middleware = File.middleware[name] = {
			read: function(file, config){
				ensureContent(file);
				
				var compiled = compile('compile', file, config);
				applyResult(file, compiled);
			}
		};
		if (Compiler.compileAsync) {
			Middleware.readAsync = function(file, config, done){
				ensureContent(file);
				compile('compileAsync', file, config, function(error, compiled){
					if (error) {
						done(error);
						return;
					}
					applyResult(file, compiled);
					done();
				});
			};
		}
		File.registerExtensions(createExtensionsMeta());
		
		// Virtual Map Files
		var SourceMapFile = class SourceMapFile extends File {
			constructor () {
				super(...arguments)
			}
			read (opts) {
				if (this.exists('mapOnly')) 
					return super.read(opts)
				
				var path = this.getSourcePath();
				if (path == null) 
					return null;
				
				var file = new File(path);
				file.read(opts);
				return (this.content = file.sourceMap);
			}
			
			readAsync (opts){
				if (this.exists('mapOnly')) 
					return super.readAsync(opts)
				
				var path = this.getSourcePath();
				if (path == null) 
					return new Class.Deferred().reject({code: 404});
				
				var file = new File(path);
				return file
					.readAsync(opts)
					.then(() => {
						return (this.content = file.sourceMap);
					});
			}
			exists (check) {
				if (super.exists()) 
					return true;
				if (check === 'mapOnly') 
					return false;
				
				var path = this.getSourcePath();
				return path != null
					? File.exists(path)
					: false;
			}
		
			getSourcePath () {
				var path = this.uri.toString(),
					source = path.replace(/\.map$/i, '');
				return path === source
					? null
					: source;
			}
		};
		
		var Factory = File.getFactory();
		options.extensions.forEach(function(ext){
			Factory.registerHandler(
				new RegExp('\\.' + ext + '.map$', 'i')
				, SourceMapFile
			);
		});
		
		function compile(method, file, config, cb){
			var source = file.content,
				path = file.uri.toString(),
				opts = obj_extend(null, options, config)
				;
			
			return Compiler[method](source, path, opts, cb)
		}
		function ensureContent(file){
			var content = file.content;
			if (typeof content !== 'string' && content.toString !== _obj_toString)
				file.content = content.toString();
		}
		function applyResult(file, compiled){
			file.sourceMap = compiled.sourceMap;
			file.content = compiled.content;
		}
		function createExtensionsMeta(){
			return obj_createMany(options.extensions, [ name + ':read' ]);
		}
		var _obj_toString = Object.prototype.toString;
	}
	function create_FileLoader(name, options, Loader) {
		var read = Loader.load || function(path, options){
				throw Error('Sync read is not Supported');
			},
			readAsync = Loader.loadAsync || function(path, options, cb){
				cb(null, this.read(path, options));
			},
			readSourceMapAsync = Loader.loadSourceMapAsync
			;
			
		var Virtual = class VirtualFile extends File ({
			constructor () {
				super(...arguments)
			}
			exists () {
				return true;
			}
			existsAsync (cb) {
				cb(null, true)
			}
			read (options) {
				return this.content
					|| (this.content = read.call(this, this.uri.toLocalFile(), options));
			}
			readAsync (options) {
				return new Promise((resolve, reject) => {
					if (this.content) {
						resolve(this.content);
						return;
					}
				
					readAsync.call(this, this.uri.toLocalFile(), options, (error, content) => {
						if (error) {
							reject(error);
							return;
						}
						resolve(this.content = content);
					});
				});
			}
			readSourceMapAsync (options) {
				return new Promise((resolve, reject) => {
					if (readSourceMapAsync) {
						reject('readSourceMapAsync not implemented');
						return;
					}
					if (this.sourceMap) {
						resolve(this.sourceMap);
						return;
					}
					readSourceMapAsync.call(this, options, (error, content) => {
						if (error) {
							reject(error);
							return;
						}
						resolve(this.sourceMap = sourceMap);
					});
				})				
			}
			write () {
				if (Loader.write) {
					return Loader.write.call(this, ...arguments);
				}
				return super.write(...arguments);
			}
			writeAsync () {
				if (Loader.write) {
					return Loader.writeAsync.call(this, ...arguments);
				}
				return super.writeAsync(...arguments);
			}
		};
		var Factory = File.getFactory();
		options.extensions.forEach(function(ext){
			Factory.registerHandler(
				new RegExp('\\.' + ext + '$', 'i')
				, Virtual
			);
		});
	}
	function create_IncludeLoader(name, options, Compiler, Loader){
		if (typeof include === 'undefined' || include == null || include.cfg == null) {
			return;
		}
		include.cfg({
			loader: obj_createMany(options.extensions, {
				load: Loader == null ? null : function(resource, cb){
					
					if (Loader.loadAsync) {
						Loader.loadAsync(resource.url, {}, function(err, content){
							cb(resource, content);
						});
						return;
					}
					cb(resource, Loader.load(resource.url));
				},
				process: function(source, resource){
					if (Compiler == null)
						return source;
					
					options = obj_extend({}, options);
					// source map for include in nodejs is not required
					options.sourceMap = false;
					return Compiler.compile(source, resource.url, options).content;
				}
			})
		});
	}
	function create_HttpHandler(name, options, Compiler){
		function try_createFile(base, url, onSuccess, onFailure) {
			var path = path_combine(base, url);
			File
				.existsAsync(path)
				.fail(onFailure)
				.done(function(exists){
					if (exists) 
						return onSuccess(new File(path));
					onFailure();
				});
		};
		function try_createFile_byConfig(config, property, url, onSuccess, onFailure){
			var base = config && config[property];
			if (base == null) {
				onFailure();
				return;
			}
			try_createFile(base, url, onSuccess, onFailure);
		}
		function try_createFile_viaStatic(config, url, onSuccess, onFailure){
			if (_resolveStaticPath === void 0) {
				var x;
				_resolveStaticPath = (x = global.atma)
					&& (x = x.server)
					&& (x = x.StaticContent)
					&& (x = x.utils)
					&& (x = x.resolvePath)
					;
			}
			if (_resolveStaticPath == null) {
				onFailure();
				return;
			}
			var file = new io.File(_resolveStaticPath(url, config));
			if (file.exists() === false) {
				onFailure();
				return;
			}
			onSuccess(file);
		}
		var _resolveStaticPath;
		
		return Class.create(Class.Deferred, {
			process: function(req, res, config){
				var handler = this,
					url = req.url,
					q = req.url.indexOf('?');
				if (q !== -1) 
					url = url.substring(0, q);
				
				var isSourceMap = url.substr(-4) === '.map';
				if (isSourceMap) 
					url = url.substring(0, url.length - 4);
					
				if (url[0] === '/') 
					url = url.substring(1);
					
				
				
				options.base = config.base;
				
				try_createFile_viaStatic(config, url, onSuccess, try_Static);
				
				function try_Static(){
					try_createFile_byConfig(config, 'static', url, onSuccess, try_Base);
				}
				function try_Base() {
					try_createFile_byConfig(config, 'base', url, onSuccess, try_Cwd);
				}
				function try_Cwd() {
					try_createFile(process.cwd(), url, onSuccess, onFailure);
				}
				function onFailure(){
					handler.reject('Not Found - ' + url, 404, 'text/plain');
				}
				function onSuccess(file){
					var fn = file.readAsync;
					if (isSourceMap && file.readSourceMapAsync) 
						fn = file.readSourceMapAsync;
					
					fn
						.call(file)
						.fail(handler.rejectDelegate())
						.done(function(){
							var source = isSourceMap
								? file.sourceMap
								: file.content;
								
							var mimeType = isSourceMap
								? 'application/json'
								: (file.mimeType || options.mimeType)
								;
								
							handler.resolve(source, 200, mimeType);
						})
				}
			}
		})
	}


	function getOptions(loaderName, default_) {
		var options = global.app && app.config.$get('settings.' + loaderName);
		
		options = obj_extend(default_, options);
		if (typeof options.extensions === 'string') 
			options.extensions = [ options.extensions ];
		
		return options;
	}
	function obj_extend(obj, source) {
		if (obj == null) 
			obj = {};
		if (source == null) 
			return obj;
		for (var key in source) 
			obj[key] = source[key];
		return obj;
	}
	function obj_createMany(properties, value){
		var obj = {};
		properties.forEach(function(prop){
			obj[prop] = value;
		});
		
		return obj;
	}
	function path_combine() {
		var args = arguments,
			str = '';
		for (var i = 0, x, imax = args.length; i < imax; i++){
			x = args[i];
			if (!x)
				continue;

			if (!str) {
				str = x;
				continue;
			}

			if (str[str.length - 1] !== '/')
				str += '/';

			str += x[0] === '/' ? x.substring(1) : x;
		}
		return str;
	}
}());