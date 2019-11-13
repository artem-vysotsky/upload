/**
 * Клас для роботи з завантаженням файла
 *
 * @author      Артем Висоцький <a.vysotsky@gmail.com>
 * @package     Upload
 * @link        http://upload.local
 * @copyright   Всі права застережено (c) 2019 Upload
 */

function Upload(file, options, callbacks) {
    let self = {};
    let parent = this;
    self.callbacks = this.callbacks;
    let properties = {
        url: 'http://upload2.local/api.php?action=',
        hash: null, length: 1024, offset: 0, size: 0, iteration: 1,
        time: null, speed: 0, pause: false, stop: false, timeout: 30000,
        retry: {count: 0, limit: 5, interval: 5000}, debug: false, error: null
    };
    let methods = {};
    this.setError = function(error) {
        properties.error = error;
        if (!!callbacks.fail) callbacks.fail();
    };
    this.getError = function() {return properties.error;};
    this.getSize = function() {return properties.size;};
    this.getStatus = function() {
        let status = {};
        status.chunk = properties.length;
        status.speed = properties.speed;
        status.time = new Date().getTime() / 1000;
        status.timeElapsed = Math.round(status.time - properties.time);
        if (properties.speed > 0) {
            status.timeEstimate = file.size / (properties.size / status.timeElapsed);
            status.timeEstimate = Math.round(status.timeEstimate - status.timeElapsed);
        } else {
            status.timeEstimate = 0;
        }
        return status;
    };
    this.start = function() {methods.open();};
    this.pause = function() {properties.pause = true;};
    this.resume = function() {
        properties.pause = false;
        methods.append();
    };
    this.stop = function() {
        if (properties.pause !== false) {
            methods.remove();
        } else {
            properties.stop = true;
        }
    };
    methods.open = function() {
        methods.request('open', {}, {
            'done': function(responce){
                properties.hash = responce.hash;
                properties.time = new Date().getTime() / 1000;
                methods.append();
            },
            'fail': function() {
                if (properties.retry.count > properties.retry.limit) {
                    parent.setError('При створенні файлу на сервері виникла помилка');
                    return;
                }
                properties.retry.count ++;
                methods.open();
            }
        });
    };
    methods.append = function(){
        if (properties.pause !== false) {
            properties.speed = 0;
            return;
        }
        if (properties.stop !== false) {
            methods.remove();
            return;
        }
        let timestamp = new Date().getTime();
        let end = properties.offset + properties.length;
        let chunk = file.slice(properties.offset, end);
        methods.request('append', {chunk: chunk}, {
            'done': function(responce) {
                let speed = (new Date().getTime() - timestamp) / 1000;
                speed = Math.round((responce.size - properties.size) / speed);
                if (speed > properties.speed) {
                    if (properties.length < 104576) properties.length += 1024;
                } else {
                    if (properties.length > 1024) properties.length -= 1024;
                }
                properties.speed = speed;
                properties.size = responce.size;
                if (properties.size < file.size) {
                    properties.offset = end;
                    methods.append();
                } else {
                    methods.close();
                }
                properties.iteration ++;
                if (!!callbacks.iteration) callbacks.iteration();
            },
            'fail': function(jqXHR) {
                /** @namespace jqXHR.responseJSON **/
                properties.speed = 0;
                if (jqXHR.status === 500) {
                    if (jqXHR.responseJSON.exception !== undefined) {
                        parent.setError(jqXHR.responseJSON.exception);
                    } else {
                        parent.setError('При завантажені файлу на сервер виникла невідома помилка');
                    }
                    return;
                }
                methods.reappend();
            }
        });
    };
    methods.reappend = function() {
        properties.retry.count ++;
        if (properties.retry.count > properties.retry.limit) {
            parent.setError('При завантажені файлу на сервер виникла помилка');
            methods.remove();
            return;
        }
        if (properties.debug)
            console.log('upload.reappend: ' + properties.retry.count);
            setTimeout(function() {
                methods.request('size', null, {
                    'done': function(responce) {
                        properties.offset = responce.size;
                        properties.retry.count = 0;
                        methods.append();
                    },
                    'fail': function() {
                        methods.reappend();
                    }
                })
            }, properties.retry.interval);
    };
    methods.close = function() {
        methods.request('close', {time: file.lastModified}, {
            'done': function(responce){
                if (responce.size !== file.size)
                    parent.setError('Неправельний розмір завантаженого файлу');
                properties.speed = (new Date().getTime() / 1000) - properties.time;
                properties.speed = Math.round(properties.size / properties.speed);
                if (!!callbacks.done) callbacks.done();
            },
            'fail': function() {
                if (properties.retry.count > properties.retry.limit) {
                    methods.remove();
                    parent.setError('При переміщенні файла на сервері виникла помилка');
                    return;
                }
                properties.retry.count ++;
                methods.close();
            }
        });
    };
    methods.remove = function() {
        methods.request('remove', null, {
            'fail': function() {
                if (properties.retry.count > properties.retry.limit) {
                    parent.setError('При видаленні файлу з сервера виникла помилка');
                    return;
                }
                properties.retry.count ++;
                methods.remove();
            }
        });
    };
    methods.request = function(action, data, callbacks) {
        let params = {
            method: 'POST', url:properties.url + action, data: {},
            text: 'text', dataType: 'json', cache: false, timeout: properties.timeout};
        if (!!data) params.data = data;
        params.data.name = file.name;
        if (!!properties.hash) params.data.hash = properties.hash;
        if (params.data.chunk !== undefined) {
            let formData = new FormData();
            formData.append('name', params.data.name);
            formData.append('hash', params.data.hash);
            formData.append('chunk', params.data.chunk, params.data.name);
            params.data = formData;
            params.processData = false;
            params.contentType = false;
        }
        console.log(params);
        let xhr = $.ajax(params)
        .done(function(responce) {
            console.log(responce);
            properties.retry.count = 0;
            if (!!callbacks && !!callbacks.done) callbacks.done(responce);
        })
        .fail(function(jqXHR) {
            console.log('request.fail');
            console.log(jqXHR);
            properties.retry.count ++;
            console.log(properties.retry);
            if ((jqXHR.readyState === 0) || ['502', '503', '504'].includes(status)) {
                if (properties.retry.count <= properties.retry.limit) {
                    methods.request(action, data, callbacks);
                    return false;
                }
                parent.setError('Неможливо виконати запит "' + action + '" (' + jqXHR.statusText + ')');
            } else {
                if ((status === 500) && !!jqXHR.exception) {
                    parent.setError(jqXHR.exception);
                } else {
                    parent.setError(jqXHR.responseText);
                }
            }
            //if (!!callbacks && !!callbacks.fail) callbacks.fail(jqXHR);
        });
    };
    if (options !== undefined) {
        if (options.timeout !== undefined)
            properties.timeout = options.timeout;
        if (options.retry.limit !== undefined)
            properties.retry.limit = options.retry.limit;
        if (options.retry.interval !== undefined)
            properties.retry.interval = options.retry.interval;
        if (options.debug !== undefined)
            properties.debug = options.debug;
    }
    if (properties.debug) console.log(file);
    if (properties.debug) console.log(properties);
}
