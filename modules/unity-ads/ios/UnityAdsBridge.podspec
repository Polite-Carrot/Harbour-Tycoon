Pod::Spec.new do |s|
  s.name           = 'UnityAdsBridge'
  s.version        = '1.0.0'
  s.summary        = 'Unity Ads rewarded ads for Harbour Tycoon'
  s.description    = 'A small Expo module around the Unity Ads SDK: initialise, load and show rewarded ads.'
  s.license        = 'UNLICENSED'
  s.author         = 'Polite Carrot'
  s.homepage       = 'https://harbourtycoon.politecarrot.com'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'UnityAds', '~> 4.21'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,swift}'
end
