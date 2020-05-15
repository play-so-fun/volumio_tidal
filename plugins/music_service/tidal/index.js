const libQ = require('kew');
const Conf = require('v-conf');
const TidalAPI = require('tidalapi');
var navigation = require('./navigation')();
//const Sox = require('sox');

module.exports = class ControllerTidaPlugin {
  constructor(context) {
    this.context = context;
    this.commandRouter = this.context.coreCommand;
    this.logger = this.context.logger;
    this.configManager = this.context.configManager;

    this.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::constructor`);
  }

  /**
   * onVolumioStart
   * @return
   */
  onVolumioStart() {
    this.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::onVolumioStart`);

    const configFile = this.commandRouter.pluginManager.getConfigurationFile(this.context, 'config.json');

    this.config = new Conf();
    this.config.loadFile(configFile);

    return libQ.resolve();
  }

  /**
   * getConfigurationFiles
   * @return
   */
  getConfigurationFiles() {
    return ['config.json'];
  };

  /**
   * onStart
   * @return
   */
  onStart() {
    var self = this;
    self.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::onStart`);
    self.mpdPlugin = self.commandRouter.pluginManager.getPlugin('music_service', 'mpd');

    if(typeof self.config.get('username') == 'string' && typeof self.config.get('password') == 'string'){
      const defer = libQ.defer();
      self.api = new TidalAPI({
        username: self.config.get('username'),
        password: self.config.get('password'),
        quality: 'HI_RES',
      });
      self.api.tryLogin(self.api.authData, function(){
           //var myId = self.api.getMyID();
           self.addToBrowseSources();
           defer.resolve();
        })
      return defer.promise;
    }else{
      return libQ.resolve();
    }
  }

  /**
   * onStop
   * @return
   */
  onStop() {
    this.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::onStop`);

    const defer = libQ.defer();
    // Once the Plugin has successfull stopped resolve the promise
    this.removeFromBrowseSources();
    defer.resolve();
    return libQ.resolve();
  }

  /**
   * onRestart
   * @return void
   */
  onRestart() {
    this.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::onRestart`);
    // Optional, use if you need it
  }

  resume() {
    var self = this;
    self.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::resume`);
    self.commandRouter.stateMachine.setConsumeUpdateService('mpd', true, false);
    return self.mpdPlugin.sendMpdCommand('play', []);
  }

  /*
  |--------------------------------------------------------------------------
  | Configuration Methods
  |--------------------------------------------------------------------------
  */

  /**
   * getUIConfig
   * @return promise
   */
  getUIConfig() {
    this.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::getUIConfig`);

    const defer = libQ.defer();
    const self = this;
    const langCode = this.commandRouter.sharedVars.get('language_code');

    self.commandRouter
      .i18nJson(`${__dirname}/i18n/strings_${langCode}.json`,
        `${__dirname}/i18n/strings_en.json`,
        `${__dirname}/UIConfig.json`)
      .then((uiconf) => {
        //remove either the log on or logout section
        var indexOfSectionToRemove =
            self.api.loggedIn && self.api._sessionID.length > 0
                ? 0
                : 1;

        //account settings/login
        uiconf.sections[0].content[0].value = self.config.get('username');
        uiconf.sections[0].content[1].value = '';

        //account settings/logout
        uiconf.sections[1].description = 
            uiconf.sections[1].description.replace('{0}', self.config.get('username'));

        uiconf.sections.splice(indexOfSectionToRemove, 1);

        defer.resolve(uiconf);
      })
      .fail(() => {
        defer.reject(new Error());
      });

    return defer.promise;
  }

  /**
   * setUIConfig
   * @return void
   */
  setUIConfig() {
    this.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::setUIConfig`);
    // Perform your installation tasks here
  }

  /**
   * getConf
   * @return void
   */
  getConf() {
    this.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::getConf`);
    // Perform your installation tasks here
  }

  /**
   * setConf
   * @return void
   */
  setConf() {
    this.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::setConf`);
    // Perform your installation tasks here
  }

  /*
  |--------------------------------------------------------------------------
  | Playback controls
  |--------------------------------------------------------------------------
  */

  /**
   * addToBrowseSources
   * @return void
   */
  addToBrowseSources() {
    this.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::addToBrowseSources`);

    this.commandRouter.volumioAddToBrowseSources({
      name: 'Tidal',
      uri: 'tidal',
      plugin_type: 'music_service',
      plugin_name: 'tidal',
      albumart: '/albumart?sourceicon=music_service/tidal/tidal.svg',
    });
  }

  /**
   * addToBrowseSources
   * @return void
   */
  removeFromBrowseSources() {
    var self = this;

    self.commandRouter.volumioRemoveToBrowseSources('Tidal');
  };

  /**
   * handleBrowseUri
   * @return void
   */
  handleBrowseUri(curUri) {
    var self = this;

    self.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::handleBrowseUri:  ` + curUri);

    var response;
    var uriParts = curUri.split('/');

    if(curUri.startsWith('tidal')){
      //root
      if(curUri === 'tidal'){
        response = self.rootList();
      }
      //my playlists
      else if(curUri.startsWith('tidal/myplaylists')){
        if(curUri === 'tidal/myplaylists'){
          response = self.listMyPlaylists(curUri);
        }else{
          response = self.listPlaylistTracks(curUri);
        }        
      }
      //favorite playlists
      else if(curUri.startsWith('tidal/favoriteplaylists')){
        if(curUri === 'tidal/favoriteplaylists'){
          response = self.listFavoritePlaylists(curUri);
        }else{
          response = self.listPlaylistTracks(curUri);
        }        
      }
      //my albums
      else if(curUri.startsWith('tidal/myalbums')){
        if(curUri === 'tidal/myalbums'){
          response = self.listMyAlbums(curUri);
        }else{
          response = self.listAlbumTracks(curUri);
        }        
      }
      //featured albums
      else if(curUri.startsWith('tidal/topalbums')){
        if(curUri === 'tidal/topalbums'){
          response = self.listFeaturedAlbums(curUri, 'topalbums');
        }else{
          response = self.listAlbumTracks(curUri);
        }        
      }
      else if(curUri.startsWith('tidal/staffpickalbums')){
        if(curUri === 'tidal/staffpickalbums'){
          response = self.listFeaturedAlbums(curUri, 'staffpickalbums');
        }else{
          response = self.listAlbumTracks(curUri);
        }        
      }
      else if(curUri.startsWith('tidal/newalbums')){
        if(curUri === 'tidal/newalbums'){
          response = self.listFeaturedAlbums(curUri, 'newalbums');
        }else{
          response = self.listAlbumTracks(curUri);
        }        
      }
      //my artists
      else if(curUri.startsWith('tidal/myartists')){
        if(curUri === 'tidal/myartists'){
          response = self.listMyArtists(curUri);
        }else{
          response = self.listTopTracks(curUri);
        }        
      }
      //my tracks
      else if(curUri.startsWith('tidal/mytracks')){
        response = self.listArtistTopTracks(curUri);     
      }
    }

    return response
        .fail(function (e) {
            self.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::handleBrowseUri failed`);
            libQ.reject(new Error());
        });
    
  }

  /**
   * Define a method to clear, add, and play an array of tracks
   * @return
   */
  clearAddPlayTrack(track) {
    var self = this;
    self.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::clearAddPlayTrack`);
    self.commandRouter.logger.info(JSON.stringify(track));

    return self.mpdPlugin.sendMpdCommand('stop', [])
      .then(() => self.mpdPlugin.sendMpdCommand('clear', []))
      .then(() => self.mpdPlugin.sendMpdCommand(`load "${track.uri}"`, []))
      .fail(() => self.mpdPlugin.sendMpdCommand(`add "${track.uri}"`, []))
      .then(() => {
          self.commandRouter.stateMachine.setConsumeUpdateService('mpd', true, false);
          return self.mpdPlugin.sendMpdCommand('play', []);
      });
  }

  /**
   * seek
   * @return
   */
  seek(timepos) {
    this.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::seek to ${timepos}`);
    return this.mpdPlugin.seek(timepos);
  }

  /**
   * stop
   * @return void
   */
  stop() {
    var self = this;
    self.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::stop`);
    return self.mpdPlugin.sendMpdCommand('stop', []);
  }

  /**
   * pause
   * @return void
   */
  pause() {
    var self = this;
    self.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::pause`);
    self.commandRouter.stateMachine.setConsumeUpdateService('mpd', true, false);

    return self.mpdPlugin.sendMpdCommand('pause', []);
  }

  /**
   * getState
   * @return void
   */
  getState() {
    this.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::getState`);
    return this.mpdPlugin.getState();
  }

  /**
   * parseState
   * @return void
   */
  parseState() {
    this.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::parseState}`);
    return this.mpdPlugin.parseState();
    // Use this method to parse the state and eventually send it with the following function
  }

  /**
   * pushState
   * @return
   */
  pushState(state) {
    this.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::pushState`);
    return this.commandRouter.servicePushState(this.getState(), this.servicename);
  }

  /**
   * explodeUri
   * @return
   */
  explodeUri(uri) {
    var self = this;
    this.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::explodeUri`);

    const defer = libQ.defer();

    // Play
    if (uri.startsWith('tidal/tracks')) {
      const uriSplitted = uri.substring(uri.lastIndexOf('/') + 1, uri.length);// get the id
      self.api.getStreamURL({ id: uriSplitted }, (streamData) => {
        self.api.getTrackInfo({ id: uriSplitted }, (trackInfo) => {
          self.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::explodeUri ${JSON.stringify(streamData)}`);
          self.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::explodeUri ${JSON.stringify(trackInfo)}`);
          defer.resolve({
            uri: streamData.url,
            service: 'tidal',
            name: trackInfo.title,
            artist: trackInfo.artist.name,
            album: trackInfo.album.title,
            type: 'song',
            duration: trackInfo.duration,
            tracknumber: trackInfo.trackNumber,
            albumart: trackInfo.album.cover ? self.api.getArtURL(trackInfo.album.cover, 640, 640) : '',
            samplerate: streamData.soundQuality === 'HI_RES' ? '96 kHz' : '44.1 kHz',
            bitdepth: streamData.soundQuality === 'HI_RES' ? '24 bit' : '16 bit',
            trackType: streamData.codec,
          });
        });
      });
    }

    return defer.promise;
  }

  /**
   * getAlbumArt
   * @return string
   */
  getAlbumArt(data, path) {
    this.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::getAlbumArt`);

    return `${data}${path}`;
  }

  /**
   * search
   * @param string
   * @return string
   */
  search(q) {
    var self = this;
    self.commandRouter.logger.info(`[${Date.now()}] ControllerTidalPlugin::search ${JSON.stringify(q)}`);
    const defer = libQ.defer();
    const list = [];

    self.api.search({
      type: 'tracks,albums,artists',
      query: q.value,
      limit: 999,
    }, (data) => {
      list.push({
        type: 'title',
        title: 'Tidal Artists',
        availableListViews: ['list', 'grid'],
        items: data.artists.items.map(function(data){
                  return navigation.item('folder', 
                                          data.name, 
                                          data.name, 
                                          '',
                                          data.picture ? self.api.getArtURL(data.picture, 640, 428) : '',
                                          data.picture ? '' : 'fa fa-user', 
                                          'tidal/myartists/' + data.id
                                        );
              }),
      });
      list.push({
        type: 'title',
        title: 'Tidal Tracks',
        availableListViews: ['list', 'grid'],
        items: data.tracks.items.map(function(track){
                  return navigation.item('song', 
                                          track.title, 
                                          track.artists[0].name, 
                                          track.album.title, 
                                          track.album.cover ? self.api.getArtURL(track.album.cover, 640, 640) : '', 
                                          track.album.cover ? '' : 'fa fa-music',
                                          'tidal/mytracks/' + track.id
                                        );
            }),
      });
      list.push({
        type: 'title',
        title: 'Tidal Albums',
        availableListViews: ['list', 'grid'],
        items: data.albums.items.map(function(data){
                      return navigation.item('folder', 
                                              data.title, 
                                              data.artists[0].name, 
                                              '', 
                                              data.cover ? self.api.getArtURL(data.cover, 640, 640) : '', 
                                              data.cover ? '' : 'fa fa-folder-open-o', 
                                              'tidal/myalbums/' + data.id
                                            );
              }),
      });

      defer.resolve(list);
    });

    return defer.promise;
  }

  /**
   * saveTidalAccount
   * @return void
   */
  saveAccount(data) {
    var self = this;

    self.config.set('username', data.username);
    self.config.set('password', data.password);
    //self.config.set('token', data.token);
    //self.config.set('bitrate', data.bitrate);

    if(typeof data.username == 'string' && typeof data.password == 'string'){
      const defer = libQ.defer();
      self.api = new TidalAPI({
        username: data.username,
        password: data.password,
        quality: 'HI_RES',
      });
      self.api.tryLogin(self.api.authData, function(res){
           //var myId = self.api.getMyID();
           if(res.statusCode !== 200){
              self.commandRouter.pushToastMessage('error', "Tidal Account Login", 'Tidal account login failed.');
           }else{
              self.addToBrowseSources();
              self.commandRouter.pushToastMessage('success', "Tidal Account Login", 'You have been successsfully logged in to your Tidal account');
           }
           defer.resolve();
        })
      return defer.promise;
    }else{
      return libQ.resolve();
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Temporary methods
  |--------------------------------------------------------------------------
  */

  /**
   * tidalAccountLogout
   * @return promise
   */
  tidalAccountLogout(){
    var self = this;

    self.config.set('password', "");

    self.api.loggedIn = false;
    self.api._sessionID = null;

    self.removeFromBrowseSources();
    self.commandRouter.pushToastMessage('success', "Tidal Account Log out", 'You have been successsfully logged out of your Tidal account');

    return libQ.resolve();
  }

  /**
   * rootList
   * @return promise
   */
  rootList(){
    //My Collection
    var items1 = [
            navigation.navigationFolder("Favorite Playlists", "tidal/favoriteplaylists"),
            navigation.navigationFolder("My Playlists", "tidal/myplaylists"),
            navigation.navigationFolder("My Albums", "tidal/myalbums"),
            navigation.navigationFolder("My Tracks", "tidal/mytracks"),
            navigation.navigationFolder("My Artists", "tidal/myartists")            
        ];
    //Editorial
    var items2 = [
            navigation.navigationFolder("Top Albums", "tidal/topalbums"),
            navigation.navigationFolder("New Albums", "tidal/newalbums"),
            navigation.navigationFolder("Staff Pick Albums", "tidal/staffpickalbums")
        ];

    //browse sections
    var sections = [
            navigation.browseSection("My Collection", ["list","grid"], items1, ''),
            navigation.browseSection("Editorial", ["list","grid"], items2, ''),
    ]

    return libQ.resolve(navigation.browse(sections, "/"));
  }

  /**
   * listMyPlaylists
   * @return promise
   */
  listMyPlaylists(curUri){
       var self = this;
       var defer = libQ.defer();
       var uriParts = curUri.split('/');
       var callback = function(data){
              var navigationItems = data.items.map(function(data){
                      return navigation.item('folder', 
                                              data.title, 
                                              data.promotedArtists, 
                                              data.description, 
                                              data.squareImage ? self.api.getArtURL(data.squareImage, 640, 640) : '', 
                                              data.squareImage ? '' : 'fa fa-folder-open-o', 
                                              curUri + '/' + (data.id || data.uuid)
                                            );
              });
              console.log(navigationItems);
              var navigationSections = [
                      navigation.browseSection('', ["list","grid"], navigationItems, 'fa fa-folder-open-o'),
              ];
              var navigationItemList = navigation.browse(navigationSections, curUri.substring(0, curUri.lastIndexOf('/')));// cut curUri

              defer.resolve(navigationItemList);
       }
       self.api.getPlaylists(self.api.getMyID(), callback);

       return defer.promise;
  }

  /**
   * listFavoritePlaylists
   * @return promise
   */
  listFavoritePlaylists(curUri){
       var self = this;
       var defer = libQ.defer();
       var uriParts = curUri.split('/');
       var callback = function(data){
              var navigationItems = data.items.map(function(data){
                      return navigation.item('folder', 
                                              data.title, 
                                              data.promotedArtists, 
                                              data.description, 
                                              data.squareImage ? self.api.getArtURL(data.squareImage, 640, 640) : '', 
                                              data.squareImage ? '' : 'fa fa-folder-open-o', 
                                              curUri + '/' + (data.id || data.uuid)
                                            );
              });
              console.log(navigationItems);
              var navigationSections = [
                      navigation.browseSection('', ["list","grid"], navigationItems, 'fa fa-folder-open-o'),
              ];
              var navigationItemList = navigation.browse(navigationSections, curUri.substring(0, curUri.lastIndexOf('/')));// cut curUri

              defer.resolve(navigationItemList);
       }
       self.api.getFavoritePlaylists(self.api.getMyID(), callback);

       return defer.promise;
  }

  /**
   * listMyAlbums
   * @return promise
   */
  listMyAlbums(curUri){
       var self = this;
       var defer = libQ.defer();
       var uriParts = curUri.split('/');
       var callback = function(data){
              var navigationItems = data.items.map(function(data){
                      return navigation.item('folder', 
                                              data.item.title, 
                                              data.item.artist.name, 
                                              '', 
                                              data.item.cover ? self.api.getArtURL(data.item.cover, 640, 640) : '', 
                                              data.item.cover ? '' : 'fa fa-folder-open-o', 
                                              curUri + '/' + data.item.id
                                            );
              });
              console.log(navigationItems);
              var navigationSections = [
                      navigation.browseSection('', ["list","grid"], navigationItems, 'fa fa-folder-open-o'),
              ];
              var navigationItemList = navigation.browse(navigationSections, curUri.substring(0, curUri.lastIndexOf('/')));// cut curUri

              defer.resolve(navigationItemList);
       }
       self.api.getFavoriteAlbums(self.api.getMyID(), callback);

       return defer.promise;
  }

  /**
   * listFeaturedAlbums
   * @return promise
   */
  listFeaturedAlbums(curUri, choice){
       var self = this;
       var defer = libQ.defer();
       var uriParts = curUri.split('/');
       var index;

       switch(choice){
        case 'newalbums':
          index = 0;
          break;
        case 'staffpickalbums':
          index = 1;
          break;
        case 'topalbums':
          index = 2;
          break;
       }

       var callback = function(data){
              var navigationItems = data.rows[0].modules[0].tabs[index].pagedList.items.map(function(data){
                      return navigation.item('folder', 
                                              data.title, 
                                              data.artists[0].name,
                                              '', 
                                              data.cover ? self.api.getArtURL(data.cover, 640, 640) : '', 
                                              data.cover ? '' : 'fa fa-folder-open-o', 
                                              curUri + '/' + data.id
                                            );
              });
              console.log(navigationItems);
              var navigationSections = [
                      navigation.browseSection('', ["list","grid"], navigationItems, 'fa fa-folder-open-o'),
              ];
              var navigationItemList = navigation.browse(navigationSections, curUri.substring(0, curUri.lastIndexOf('/')));// cut curUri

              defer.resolve(navigationItemList);
       }
       self.api.getFeaturedAlbums('', callback);

       return defer.promise;
  }

  /**
   * listMyArtists
   * @return promise
   */
  listMyArtists(curUri){
       var self = this;
       var defer = libQ.defer();
       var uriParts = curUri.split('/');
       var callback = function(data){
              var navigationItems = data.items.map(function(data){
                      return navigation.item('folder', 
                                              data.item.name, 
                                              data.item.name, 
                                              '', 
                                              data.item.picture ? self.api.getArtURL(data.item.picture, 640, 428) : '', 
                                              data.item.picture ? '' : 'fa fa-user', 
                                              curUri + '/' + data.item.id
                                            );
              });
              console.log(navigationItems);
              var navigationSections = [
                      navigation.browseSection('', ["list","grid"], navigationItems, 'fa fa-folder-open-o'),
              ];
              var navigationItemList = navigation.browse(navigationSections, curUri.substring(0, curUri.lastIndexOf('/')));// cut curUri

              defer.resolve(navigationItemList);
       }
       self.api.getFavoriteArtists(self.api.getMyID(), callback);

       return defer.promise;
  }

  /**
   * listPlaylistTracks
   * @return promise
   */
  listPlaylistTracks(curUri) {
      var self = this;
      var defer = libQ.defer();
      var id = curUri.substring(curUri.lastIndexOf('/') + 1, curUri.length);
      var callback = function(data){
            var navigationItems = data.items.map(function(track){
                  return navigation.item('song', 
                                          track.title, 
                                          track.artist.name, 
                                          track.album.title, 
                                          track.album.cover ? self.api.getArtURL(track.album.cover, 640, 640) : '', 
                                          track.album.cover ? '' : 'fa fa-music',  
                                          'tidal/tracks/' + track.id
                                        );
            });
            console.log(navigationItems);
            var navigationSections = [
                    navigation.browseSection('', ["list","grid"], navigationItems, 'fa fa-folder-open-o'),
              ];
            var navigationItemList = navigation.browse(navigationSections, curUri.substring(0, curUri.lastIndexOf('/')));

            defer.resolve(navigationItemList);
      }
      self.api.getPlaylistTracks(id, callback);
 
      return defer.promise;
  }

  /**
   * listAlbumTracks
   * @return promise
   */
  listAlbumTracks(curUri) {
      var self = this;
      var defer = libQ.defer();
      var id = curUri.substring(curUri.lastIndexOf('/') + 1, curUri.length);
      var callback = function(data){
            var navigationItems = data.items.map(function(track){
                  return navigation.item('song', 
                                          track.title, 
                                          track.artist.name, 
                                          track.album.title, 
                                          track.album.cover ? self.api.getArtURL(track.album.cover, 640, 640) : '', 
                                          track.album.cover ? '' : 'fa fa-music',
                                          'tidal/tracks/' + track.id
                                        );
            });
            console.log(navigationItems);
            var navigationSections = [
                    navigation.browseSection('', ["list","grid"], navigationItems, 'fa fa-folder-open-o'),
              ];
            var navigationItemList = navigation.browse(navigationSections, curUri.substring(0, curUri.lastIndexOf('/')));

            defer.resolve(navigationItemList);
      }
      self.api.getAlbumTracks(id, callback);

      return defer.promise;
  }

  /**
   * listTopTracks
   * @return promise
   */
  listTopTracks(curUri) {
      var self = this;
      var defer = libQ.defer();
      var id = curUri.substring(curUri.lastIndexOf('/') + 1, curUri.length);
      var callback = function(data){
            var navigationItems = data.items.map(function(track){
                  return navigation.item('song', 
                                          track.title, 
                                          track.artist.name, 
                                          track.album.title, 
                                          track.album.cover ? self.api.getArtURL(track.album.cover, 640, 640) : '', 
                                          track.album.cover ? '' : 'fa fa-music', 
                                          'tidal/tracks/' + track.id
                                        );
            });
            console.log(navigationItems);
            var navigationSections = [
                    navigation.browseSection('', ["list","grid"], navigationItems, 'fa fa-folder-open-o'),
              ];
            var navigationItemList = navigation.browse(navigationSections, curUri.substring(0, curUri.lastIndexOf('/')));

            defer.resolve(navigationItemList);
      }
      self.api.getTopTracks(id, callback);

      return defer.promise;
  }

  /**
   * listArtistTopTracks
   * @return promise
   */
  listArtistTopTracks(curUri, tracksGetter) {
      var self = this;
      var defer = libQ.defer();

      self.api.getFavoriteTracks(self.api.getMyID(), function(data){
            var navigationItems = data.items.map(function(track){
                  return navigation.item('song', 
                                          track.item.title, 
                                          track.item.artist.name, 
                                          track.item.album.title, 
                                          track.item.album.cover ? self.api.getArtURL(track.item.album.cover, 640, 640) : '', 
                                          track.item.album.cover ? '' : 'fa fa-music', 
                                          'tidal/tracks/' + track.item.id
                                        );
            });
            console.log(navigationItems);
            var navigationSections = [
                    navigation.browseSection('', ["list","grid"], navigationItems, 'fa fa-folder-open-o'),
              ];
            var navigationItemList = navigation.browse(navigationSections, curUri.substring(0, curUri.lastIndexOf('/')));

            defer.resolve(navigationItemList);
      });

      return defer.promise;
  }

};
