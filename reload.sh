cd gitRepos/
  for g in *; do
    cd ..
      bower up $g
    cd gitRepos/
    echo "$g updated"
  done
cd ..
 
firebase serve || sh reload.sh
