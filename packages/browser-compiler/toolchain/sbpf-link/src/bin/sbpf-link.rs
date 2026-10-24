use sbpf_link::{link_program, OptimizationConfig, ProgramOptions, SbpfArch};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (input, output) = (&args[1], &args[2]);
    let arch = match args.get(3).map(String::as_str) { Some("v0") => SbpfArch::V0, _ => SbpfArch::V3 };
    let obj = std::fs::read(input).expect("read object");
    match link_program(&obj, ProgramOptions::new(OptimizationConfig::enabled(), arch, 4096)) {
        Ok(so) => { std::fs::write(output, &so).expect("write"); println!("{} bytes", so.len()); }
        Err(e) => { eprintln!("{}", sbpf_link::SbpfLinkerError::format_errors(&e)); std::process::exit(1); }
    }
}
