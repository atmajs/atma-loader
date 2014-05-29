// should be used in DEV environment only. Compile es6 scripts for production afterwards.

if (typeof include === 'undefined') 
	throw new Error('<atma-loader> should be loaded by the `atma` toolkit.');

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
function create(data, Compiler){
	var name = data.name,
		options = getOptions(name, data.options)
		;
	
	create_FileLoader(name, options, Compiler);
	create_IncludeLoader(name, options, Compiler);
	
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

var net = global.net,
	File = global.io.File
	;
	
function create_FileLoader(name, options, Compiler){
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
	
	function compile(method, file, config, cb){
		var source = file.content,
			path = file.uri.toString(),
			opts = obj_extend(null, options, config)
			;
		
		return Compiler[method](source, path, opts, cb)
	}
	function ensureContent(file){
		if (typeof file.content !== 'string')
			file.content = file.content.toString();
	}
	function applyResult(file, compiled){
		file.sourceMap = compiled.sourceMap;
		file.content = compiled.content;
	}
	function createExtensionsMeta(){
		return obj_createMany(options.extensions, [ name + ':read' ]);
	}
}
function create_IncludeLoader(name, options, Compiler){
	include.cfg({
		loader: obj_createMany(options.extensions, {
			process: function(source, resource){
				return Compiler.compile(source, resource.url, options).content;
			}
		})
	});
}
function create_HttpHandler(name, options, Compiler){
	function try_createFile(base, url, onSuccess, onFailure) {
		var path = net.Uri.combine(base, url);
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
	
	return Class({
		Base: Class.Deferred,
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
			
			try_createFile_byConfig(config, 'static', url, onSuccess, try_Base);
			
			function try_Base() {
				try_createFile_byConfig(config, 'base', url, onSuccess, try_Cwd);
			}
			function try_Cwd() {
				try_createFile(process.cwd(), url, onSuccess, onFailure);
			}
			function onFailure(){
				handler.resolve('Not Found - ' + url, 404, 'plain/text');
			}
			function onSuccess(file){
				
				file
					.readAsync()
					.fail(handler.rejectDelegate())
					.done(function(){
						var source = isSourceMap
							? file.sourceMap
							: file.content;
							
						var mimeType = isSourceMap
							? 'application/json'
							: options.mimeType
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