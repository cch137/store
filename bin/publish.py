import os
import shutil

shutil.rmtree('dist', ignore_errors=True)
os.system('tsc')
shutil.copyfile('package.json', 'dist/package.json')

os.system(' && '.join([
  'cd dist/',
  'npm publish --access public',
]))
