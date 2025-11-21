'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AnimatedWaveBackground, AnimatedDataFlowSVG, InteractiveDashboardSVG, FloatingElementsSVG, ClickToUseDemoSVG } from '@/components/svg/AnimatedIllustrations'
import { DataUploadSVG, RealTimeProcessingSVG, ShareCollaborateSVG } from '@/components/svg/Illustrations'

export default function LandingPageDemo() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 z-0">
        <FloatingElementsSVG className="w-full h-full opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-purple-600/5 to-indigo-600/5" />
      </div>

      {/* Hero Section */}
      <section className="relative z-10 py-20 px-4">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Column - Content */}
            <div className="space-y-8">
              <div className="space-y-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                  className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                >
                  <span className="w-2 h-2 bg-blue-600 rounded-full mr-2 animate-pulse"></span>
                  Real-time Data Analysis Platform
                </motion.div>
                
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight"
                >
                  Transform Your
                  <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent block">
                    Data Analysis
                  </span>
                </motion.h1>
                
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="text-xl text-gray-600 leading-relaxed max-w-lg"
                >
                  Upload, analyze, and visualize your data with our powerful JMP-based platform. Experience real-time processing and interactive visualizations.
                </motion.p>
              </div>

              {/* CTA Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="flex flex-col sm:flex-row gap-4"
              >
                <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300">
                  Try Free Demo
                </Button>
                <Button variant="outline" className="border-2 border-gray-300 hover:border-blue-500 text-gray-700 hover:text-blue-600 px-8 py-3 text-lg font-semibold rounded-xl hover:bg-blue-50 transition-all duration-300">
                  Get Started
                </Button>
              </motion.div>

              {/* Quick Stats */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.8 }}
                className="grid grid-cols-3 gap-8 pt-8"
              >
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">3+</div>
                  <div className="text-sm text-gray-600">Analysis Plugins</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">Real-time</div>
                  <div className="text-sm text-gray-600">Processing</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">Multi-lang</div>
                  <div className="text-sm text-gray-600">Support</div>
                </div>
              </motion.div>
            </div>

            {/* Right Column - Interactive Demo */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="relative"
            >
              <div className="relative bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-white/20">
                <div className="absolute -top-4 -right-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg">
                  Live Demo
                </div>
                <ClickToUseDemoSVG className="w-full h-64" instructionText="Click to upload and process" />
              </div>
              
              {/* Floating Elements */}
              <div className="absolute -top-8 -left-8 z-10">
                <AnimatedDataFlowSVG className="w-32 h-32 opacity-60" />
              </div>
              <div className="absolute -bottom-8 -right-8 z-10">
                <InteractiveDashboardSVG className="w-40 h-32 opacity-60" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 py-20 px-4 bg-white/50 backdrop-blur-sm">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Powerful Features</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Everything you need to analyze, visualize, and share your data insights
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              viewport={{ once: true }}
            >
              <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/90 backdrop-blur-sm h-full">
                <CardHeader className="text-center pb-4">
                  <div className="flex justify-center mb-4">
                    <div className="p-4 bg-blue-100 rounded-2xl group-hover:bg-blue-200 transition-colors duration-300">
                      <DataUploadSVG className="w-16 h-16" />
                    </div>
                  </div>
                  <CardTitle className="text-xl font-semibold text-gray-900">Easy Data Upload</CardTitle>
                  <CardDescription className="text-gray-600 leading-relaxed">
                    Drag and drop your Excel files or CSV data. Our platform supports multiple formats and automatically detects data structure.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
            >
              <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/90 backdrop-blur-sm h-full">
                <CardHeader className="text-center pb-4">
                  <div className="flex justify-center mb-4">
                    <div className="p-4 bg-green-100 rounded-2xl group-hover:bg-green-200 transition-colors duration-300">
                      <RealTimeProcessingSVG className="w-16 h-16" />
                    </div>
                  </div>
                  <CardTitle className="text-xl font-semibold text-gray-900">Real-time Processing</CardTitle>
                  <CardDescription className="text-gray-600 leading-relaxed">
                    Watch your data transform in real-time with our powerful JMP engine. Get instant results and interactive visualizations.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true }}
            >
              <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/90 backdrop-blur-sm h-full">
                <CardHeader className="text-center pb-4">
                  <div className="flex justify-center mb-4">
                    <div className="p-4 bg-purple-100 rounded-2xl group-hover:bg-purple-200 transition-colors duration-300">
                      <ShareCollaborateSVG className="w-16 h-16" />
                    </div>
                  </div>
                  <CardTitle className="text-xl font-semibold text-gray-900">Share & Collaborate</CardTitle>
                  <CardDescription className="text-gray-600 leading-relaxed">
                    Share your analysis results with team members. Export charts, reports, and collaborate on projects in real-time.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 bg-white/50 backdrop-blur-sm border-t border-white/20 py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-600 text-sm">
            Developed by Dr J. Sun • Powered by JMP Analysis Engine
          </p>
        </div>
      </footer>
    </div>
  )
}
