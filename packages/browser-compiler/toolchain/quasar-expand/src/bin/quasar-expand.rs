//! Native test driver: expand every .rs file under a src/ directory into an output directory.
use std::collections::BTreeMap;
use std::path::Path;

fn collect(dir: &Path, root: &Path, files: &mut BTreeMap<String, String>) {
    for entry in std::fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            collect(&path, root, files);
        } else if path.extension().is_some_and(|e| e == "rs") {
            let rel = path.strip_prefix(root).unwrap().to_string_lossy().into_owned();
            files.insert(rel, std::fs::read_to_string(&path).unwrap());
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (src, out) = (Path::new(&args[1]), Path::new(&args[2]));
    let mut files = BTreeMap::new();
    collect(src, src, &mut files);
    match quasar_expand::expand_files(&files) {
        Ok(expanded) => {
            for (rel, code) in expanded {
                let dest = out.join(rel);
                std::fs::create_dir_all(dest.parent().unwrap()).unwrap();
                std::fs::write(dest, code).unwrap();
            }
        }
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    }
}
